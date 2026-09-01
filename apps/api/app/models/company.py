"""Company (Empresa) entity.

A Company is the top-level account BEE tracks. Leads, signals and opportunities
all ultimately relate back to a company, which is the unit of market
intelligence.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover - typing only, avoids circular imports
    from app.models.lead import Lead
    from app.models.opportunity import Opportunity
    from app.models.signal import Signal


class Company(TimestampMixin, table=True):
    """A tracked company / account."""

    __tablename__ = "companies"
    # Domain dedup is scoped per-org, not global — two organizations legitimately
    # tracking the same company (e.g. both prospecting "salesforce.com") must
    # each get their own Company row instead of colliding on one shared row.
    # Postgres treats NULL as distinct in a unique constraint, so untagged
    # (organization_id is NULL) legacy rows are exempt — acceptable since new
    # companies are always created with an org id going forward.
    __table_args__ = (UniqueConstraint("organization_id", "domain", name="uq_companies_org_domain"),)

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    # The rep this account is assigned to — same role in the visibility
    # engine (app.services.permissions) as Lead.assigned_to_user_id /
    # Opportunity.assigned_to_user_id: a MEMBER only sees accounts owned by
    # them, a MANAGER sees their team subtree's, OWNER/ADMIN see all. NULL
    # (unowned) stays visible to everyone in the org, same "untagged =
    # shared" convention as the rest of this model — most accounts predate
    # per-rep ownership and nothing should suddenly vanish from anyone's view.
    owner_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="users.id", index=True
    )

    name: str = Field(index=True, nullable=False)
    # Canonical domain is the natural dedup key for enrichment integrations.
    domain: str | None = Field(default=None, index=True)
    industry: str | None = Field(default=None, index=True)
    # Free-form headcount band (e.g. "11-50") to stay provider-agnostic.
    size: str | None = Field(default=None)
    country: str | None = Field(default=None, index=True)
    # Free-form annual-revenue band (e.g. "$1M-$10M") — same provider-agnostic
    # reasoning as size: enrichment sources report revenue in too many
    # inconsistent shapes to force into a closed set.
    revenue_range: str | None = Field(default=None)
    website: str | None = Field(default=None)
    description: str | None = Field(default=None)

    # Firmographic enrichment and provider-specific fields are kept in a JSON
    # column so the schema stays stable while integrations evolve.
    attributes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ----- Proactive market scan cursor -----------------------------------------
    # Drives MarketScanOrchestrator's cron tick (see app.services.market_scan):
    # a tick pulls whichever companies are due, oldest-due-first, across every
    # organization — the timestamp itself is the queue, no separate queue table
    # needed at this scale. NULL means "never scanned" and sorts first (a
    # company just added should get its first scan before one that's already
    # been checked recently), same "unset sorts as most-urgent" convention as
    # nullable-FK-means-unowned elsewhere in this model.
    next_scan_due_at: datetime | None = Field(default=None, index=True)
    # Observability only — not read by the scheduler itself, which relies on
    # next_scan_due_at. Lets a human answer "when did we last actually check
    # this account" without querying MarketScanLog.
    last_scanned_at: datetime | None = Field(default=None)

    # ----- Relationships -------------------------------------------------------
    leads: list["Lead"] = Relationship(back_populates="company")
    signals: list["Signal"] = Relationship(back_populates="company")
    opportunities: list["Opportunity"] = Relationship(back_populates="company")
