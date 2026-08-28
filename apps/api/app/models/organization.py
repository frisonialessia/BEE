"""Organization entity.

An Organization is the top-level tenant boundary in BEE's multi-tenant model.
Every Team and User belongs to exactly one Organization, and (going forward)
every Company/Lead/Signal/Opportunity is tagged with the Organization that
owns it — so two customers using BEE never see each other's pipeline.

``organization_id`` on the 4 core domain entities is nullable (see the
``000_baseline_domain_models`` + later migrations) to stay backward-compatible
with data ingested before multi-tenancy existed, or via integrations that
don't yet resolve an organization. Untagged (``NULL``) records are treated as
globally visible — a deliberate, narrow exception, not the general rule.
"""

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import EmployeeRange, TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover - typing only, avoids circular imports
    from app.models.team import Team
    from app.models.user import User


class Organization(TimestampMixin, table=True):
    """A tenant account. Everything else in BEE is scoped underneath one."""

    __tablename__ = "organizations"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    name: str = Field(nullable=False)
    # URL/identifier-safe handle (e.g. for a future "acme.bee.io" style login).
    slug: str = Field(index=True, unique=True)
    plan: str = Field(default="free")
    is_active: bool = Field(default=True, index=True)

    # Ideal Customer Profile — what "a good fit" means for this org, so the
    # priority matrix (fit × intent) has something real to compute against.
    # Empty lists = "not configured", which every consumer must treat as
    # "no opinion" (neutral/unknown fit), never as "matches nothing" — see
    # app.services.icp / lib/icp.ts on the frontend for how this is read.
    icp_criteria: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # This organization's own company profile — collected as a progressive
    # onboarding step in-app (see app.api.v1.endpoints.organizations), not at
    # registration, to keep signup itself to the 4 fields it already has.
    # All nullable: "not set yet" is a valid, expected state, same as
    # icp_criteria's empty lists — never treat a null here as "0 employees".
    industry: str | None = Field(default=None)
    employee_range: EmployeeRange | None = Field(default=None)
    website: str | None = Field(default=None)

    # ----- Relationships -------------------------------------------------------
    teams: list["Team"] = Relationship(back_populates="organization")
    users: list["User"] = Relationship(back_populates="organization")
