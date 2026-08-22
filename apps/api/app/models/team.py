"""Team entity — the manager hierarchy.

A Team belongs to one Organization and may have a parent Team
(``parent_team_id``), forming a tree: a manager's team can have sub-teams,
whose managers report up to them. ``app.services.permissions`` walks this
tree to answer "which users can this manager see" without the manager
needing to be a direct owner of every record.

Deliberately no ORM ``Relationship`` for the parent/children edges here —
self-referential relationships need extra SQLAlchemy configuration
(``remote_side``) for little benefit at this scale. Callers that need the
tree use plain ``select(Team).where(Team.parent_team_id == ...)`` queries
(see ``app.services.permissions.get_descendant_team_ids``).
"""

import uuid
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover
    from app.models.organization import Organization
    from app.models.user import User


class Team(TimestampMixin, table=True):
    """A node in the organization's manager hierarchy."""

    __tablename__ = "teams"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True, nullable=False)
    # NULL = top-level team (reports directly to the organization's admins).
    parent_team_id: uuid.UUID | None = Field(default=None, foreign_key="teams.id", index=True)

    name: str = Field(nullable=False)
    description: str | None = Field(default=None)

    # ----- Relationships -------------------------------------------------------
    organization: "Organization" = Relationship(back_populates="teams")
    members: list["User"] = Relationship(back_populates="team")
