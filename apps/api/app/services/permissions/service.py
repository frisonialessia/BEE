"""Manager-hierarchy visibility rules.

BEE's team model is a tree of :class:`~app.models.team.Team` rows
(``parent_team_id``), and every :class:`~app.models.user.User` sits in exactly
one team (or none, for OWNER/ADMIN). The rule this module implements:

* **OWNER / ADMIN** — see every record in their organization. No user-id
  filter applies; the caller scopes by ``organization_id`` instead (see
  :func:`scope_ids_or_none`'s docstring below for why this function returns
  ``None`` rather than "all user ids" to mean that).
* **MANAGER** — sees their own assignments, plus every assignment belonging
  to a user in their team or any descendant team. A VP over three regional
  managers sees all three regions without being a direct member of any of them.
* **MEMBER** (or a MANAGER with no team assigned yet) — sees only their own
  assignments.

This is intentionally the *only* place that walks the team tree or reasons
about role-based visibility — endpoints and repositories call
:func:`get_visible_user_ids` and apply the result as a plain ``IN`` filter (or
skip filtering entirely when it returns ``None``), never re-deriving the rule
themselves.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.models.base import UserRole
from app.models.team import Team
from app.models.user import User


def get_descendant_team_ids(session: Session, root_team_id: uuid.UUID) -> set[uuid.UUID]:
    """Return ``root_team_id`` plus every team below it in the hierarchy.

    Breadth-first traversal over ``Team.parent_team_id``. A cycle in the data
    (which application code should never create) can't cause an infinite loop
    here: each level only expands ids not already visited.
    """
    visible: set[uuid.UUID] = {root_team_id}
    frontier = [root_team_id]

    while frontier:
        rows = session.exec(select(Team.id).where(Team.parent_team_id.in_(frontier))).all()
        next_frontier = [team_id for team_id in rows if team_id not in visible]
        visible.update(next_frontier)
        frontier = next_frontier

    return visible


def get_visible_user_ids(session: Session, user: User) -> set[uuid.UUID] | None:
    """Return the set of user ids whose assigned records ``user`` may see.

    Returns ``None`` to mean "no user-level restriction" (OWNER/ADMIN) — the
    caller should still scope by ``organization_id`` separately, since ``None``
    here is not the same as "every user across every organization."
    """
    if user.role in (UserRole.OWNER, UserRole.ADMIN):
        return None

    if user.role == UserRole.MEMBER or user.team_id is None:
        return {user.id}

    # MANAGER with a team: self + everyone in that team or any descendant team.
    team_ids = get_descendant_team_ids(session, user.team_id)
    user_ids = set(session.exec(select(User.id).where(User.team_id.in_(team_ids))).all())
    user_ids.add(user.id)
    return user_ids
