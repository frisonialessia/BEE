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
from typing import TypeVar

from sqlalchemy import ColumnElement, Select
from sqlmodel import Session, or_, select

from app.models.base import UserRole
from app.models.team import Team
from app.models.user import User

SelectT = TypeVar("SelectT", bound=Select)


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


def user_can_view_assignment(
    session: Session, user: User, assigned_to_user_id: uuid.UUID | None
) -> bool:
    """Return True if ``user`` may view a record assigned to ``assigned_to_user_id``.

    An unassigned record (``None``) is visible to anyone in the organization —
    the same "untagged = visible" accommodation as
    :func:`scope_to_organization`, for records created before per-rep
    assignment existed or ones nobody has claimed yet.
    """
    if assigned_to_user_id is None:
        return True
    visible = get_visible_user_ids(session, user)
    return visible is None or assigned_to_user_id in visible


def scope_to_organization(
    statement: SelectT, organization_column: ColumnElement, user: User | None
) -> SelectT:
    """Restrict ``statement`` to ``user``'s organization.

    Used for entities without a per-rep ``assigned_to_user_id`` (Signal,
    Company) where the only meaningful boundary is the tenant itself — every
    role within an organization sees the same shared market intelligence.
    Untagged (``NULL``) records stay visible to everyone, same rationale as
    ``app.models.organization``'s docstring. A no-op when ``user`` is ``None``
    (unauthenticated/API-key-only caller) so existing integrations are
    unaffected — the same backward-compatibility contract as
    :func:`get_visible_user_ids`.
    """
    if user is None:
        return statement
    return scope_by_organization_id(statement, organization_column, user.organization_id)


def scope_by_organization_id(
    statement: SelectT, organization_column: ColumnElement, organization_id: uuid.UUID | None
) -> SelectT:
    """Like :func:`scope_to_organization`, but takes a raw organization id.

    For services reached by both a logged-in dashboard user (JWT) and an
    :class:`~app.models.organization_api_key.OrganizationApiKey` caller (no
    ``User`` at all) — e.g. dark funnel ingestion via the "Simulate Signal"
    button vs. a webhook. Both resolve to a plain
    ``organization_id: uuid.UUID | None`` via ``app.api.deps.get_organization_id``,
    so this is the shared primitive both :func:`scope_to_organization` and
    every such service build on. Same untagged-is-shared convention, and a
    no-op when ``organization_id`` is ``None``.
    """
    if organization_id is None:
        return statement
    return statement.where(or_(organization_column == organization_id, organization_column.is_(None)))
