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
from datetime import datetime
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

    # Federated Signal Intelligence — opt-in, OFF by default (same "ships
    # complete, starts off" convention as AutopilotConfig.enabled). When
    # true, this organization's own closed-deal history (StrategyOutcome
    # rows — never raw signal/company/lead data) becomes eligible to be
    # counted, in anonymized aggregate only, toward the cross-tenant priors
    # FederatedSignalIntelligenceService computes for every OTHER opted-in
    # organization — and, symmetrically, this org's own signal confidence
    # becomes eligible to be calibrated by everyone else's aggregate. See
    # app.services.federated_intelligence's module docstring for the full
    # privacy model (k-anonymity floor, what is and isn't ever exposed).
    federated_intelligence_opt_in: bool = Field(default=False, nullable=False)

    # ----- GDPR / data-erasure request ------------------------------------------
    # Set by POST /organizations/me/deletion-request (OWNER only, requires
    # re-typing the organization's name to confirm) — see
    # app.api.v1.endpoints.organizations's module docstring for why this
    # records a REQUEST rather than performing the erasure itself: cascading
    # a hard delete safely across every table an organization's data touches
    # is a reviewed, audited support-team action, not something a single API
    # call should trigger automatically. Both null = no pending request.
    #
    # deletion_requested_by_user_id is deliberately NOT a real foreign_key
    # (unlike every other *_user_id in this codebase) — Organization
    # already has a Relationship to User (`users` below) through
    # User.organization_id; a second FK column from organizations to users
    # makes that relationship's join ambiguous (SQLAlchemy can no longer
    # infer which FK path `Organization.users` should use) and every query
    # touching it starts raising AmbiguousForeignKeysError. A plain
    # unenforced UUID reference (same as AdminAuditLog.actor_user_id's
    # semantics, just without the constraint) avoids that entirely — this
    # is an audit-style pointer, not a relationship BEE ever navigates.
    deletion_requested_at: datetime | None = Field(default=None)
    deletion_requested_by_user_id: uuid.UUID | None = Field(default=None)

    # ----- Relationships -------------------------------------------------------
    teams: list["Team"] = Relationship(back_populates="organization")
    users: list["User"] = Relationship(back_populates="organization")
