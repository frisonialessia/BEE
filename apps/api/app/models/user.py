"""User entity — a human who logs into the BEE dashboard.

Distinct from ``Lead`` (a prospect BEE tracks *about* a target company) — a
``User`` is a member of a customer's own organization, using BEE to manage
their pipeline. Every User belongs to exactly one Organization and, unless
they are an OWNER/ADMIN, to exactly one Team, which places them in the
manager-visibility tree (see ``app.services.permissions``).

Passwords are always stored as a bcrypt hash (``hashed_password``); the
plaintext password never touches the database or a log line. See
``app.core.security`` for hashing/verification and JWT issuance.
"""

import uuid
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin, UserRole, new_uuid

if TYPE_CHECKING:  # pragma: no cover
    from app.models.organization import Organization
    from app.models.team import Team


class User(TimestampMixin, table=True):
    """A dashboard user within an Organization."""

    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True, nullable=False)
    # NULL for OWNER/ADMIN (org-wide visibility, no team needed) or a user not
    # yet assigned to a team.
    team_id: uuid.UUID | None = Field(default=None, foreign_key="teams.id", index=True)

    email: str = Field(index=True, unique=True, nullable=False)
    hashed_password: str = Field(nullable=False)
    full_name: str = Field(nullable=False)
    role: UserRole = Field(default=UserRole.MEMBER, index=True)
    is_active: bool = Field(default=True, index=True)

    # ----- Profile (self-service, see PATCH /users/me) -------------------------
    # All optional — "not filled in yet" is the expected state for every one
    # of these, same convention as Organization's own progressive-profile
    # fields (industry/employee_range/website).
    avatar_url: str | None = Field(default=None, max_length=1000)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=500)

    # ----- Relationships -------------------------------------------------------
    organization: "Organization" = Relationship(back_populates="users")
    team: "Team" = Relationship(back_populates="members")
