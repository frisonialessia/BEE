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
    #
    # avatar_url holds a client-resized `data:image/...;base64,...` URI, not
    # a link to somewhere else — there's no file/blob storage wired up yet,
    # so the frontend crops/downscales the picked file to a small square
    # (see lib/image.ts) before it ever reaches this field. max_length is
    # sized for that (a few hundred KB, generous headroom over the ~10-20KB
    # a compressed 128x128 thumbnail actually needs) — the underlying
    # column itself is unbounded VARCHAR (see migration 024), this is only
    # the application-level sanity cap.
    avatar_url: str | None = Field(default=None, max_length=300_000)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=500)
    # IANA timezone name (e.g. "America/Mexico_City"), not a UTC offset — an
    # offset alone can't survive a DST transition. NULL means "not chosen
    # yet"; the frontend falls back to the browser's own detected timezone
    # for that user in the meantime, same "not filled in yet is fine"
    # convention as the other profile fields above. Every meeting time is
    # already stored as an absolute UTC instant (Meeting.starts_at), so
    # changing this only changes how *this* user's own client formats it —
    # never the stored value, and never another teammate's view of it.
    timezone: str | None = Field(default=None, max_length=64)

    # ----- Relationships -------------------------------------------------------
    organization: "Organization" = Relationship(back_populates="users")
    team: "Team" = Relationship(back_populates="members")
