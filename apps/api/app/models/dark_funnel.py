"""DarkFunnelService models — external intent signal processing.

The 'dark funnel' refers to buying activity that is invisible to the seller:
anonymous website visits, G2/Capterra review reads, LinkedIn company page
views, YouTube demo watches, podcast listens, and competitor comparisons.

These signals reveal that a company is in active research mode BEFORE
they ever fill out a contact form. Capturing and aggregating them allows
BEE to surface leads that are ready to buy — before they reach out.

Signal flow
-----------
::

    DarkFunnelSignal (ingest)
        │
        ▼ aggregate per company_domain (30-day sliding window)
    HotLeadScore (computed, cached)
        │ research_intensity_score (0-100)
        │ buying_stage: awareness → consideration → decision → ready_to_buy
        ▼
    GET /api/v1/dark-funnel/hot-leads (dashboard hot leads engine)

This replaces the BehavioralCollector as the primary hot lead detector
and provides richer, multi-channel intent context.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class DarkSignalType(str):
    """The type of dark funnel signal captured."""

    REVIEW_VISIT = "review_visit"           # G2, Capterra, Trustpilot
    COMPETITOR_COMPARE = "competitor_compare"  # Viewed comparison page
    SEARCH = "search"                          # Organic search for solution keywords
    CONTENT_READ = "content_read"              # Blog, case study, white paper
    DEMO_WATCH = "demo_watch"                  # YouTube demo, Loom recording
    PRICING_VIEW = "pricing_view"              # Visited pricing page
    CASE_STUDY_VIEW = "case_study_view"        # Read customer success story
    JOB_POSTING = "job_posting"               # Company posted a job matching BEE buyer profile
    LINKEDIN_ENGAGEMENT = "linkedin_engagement"  # Liked/shared relevant content
    PRODUCT_TRIAL = "product_trial"             # Started a trial or freemium
    REPEAT_VISIT = "repeat_visit"               # Multiple visits to key pages
    OTHER = "other"


class BuyingStage(str):
    """Where the prospect is in their buying journey."""

    AWARENESS = "awareness"          # Just discovering the problem/solution
    CONSIDERATION = "consideration"  # Evaluating options
    DECISION = "decision"            # Comparing final candidates
    READY_TO_BUY = "ready_to_buy"   # Hot — reach out NOW


# ── Signal weight map (contributes to research_intensity_score) ────────────────
# Higher weight = stronger buying signal
SIGNAL_WEIGHTS: dict[str, float] = {
    DarkSignalType.REVIEW_VISIT: 15.0,
    DarkSignalType.COMPETITOR_COMPARE: 20.0,
    DarkSignalType.PRICING_VIEW: 25.0,
    DarkSignalType.DEMO_WATCH: 20.0,
    DarkSignalType.CASE_STUDY_VIEW: 15.0,
    DarkSignalType.PRODUCT_TRIAL: 30.0,
    DarkSignalType.CONTENT_READ: 8.0,
    DarkSignalType.SEARCH: 10.0,
    DarkSignalType.JOB_POSTING: 12.0,
    DarkSignalType.LINKEDIN_ENGAGEMENT: 7.0,
    DarkSignalType.REPEAT_VISIT: 10.0,
    DarkSignalType.OTHER: 5.0,
}


class DarkFunnelSignal(TimestampMixin, table=True):
    """A single captured dark funnel intent signal.

    Signals can come from multiple sources:
    * Reverse IP lookup tools (Clearbit, 6sense, Bombora)
    * Your own website analytics
    * G2 Buyer Intent API
    * LinkedIn Analytics
    * Manual entry by sales team
    """

    __tablename__ = "dark_funnel_signals"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )

    # ── Identity ───────────────────────────────────────────────────────────────
    company_domain: str = Field(index=True, nullable=False)
    company_name: str | None = Field(default=None)
    lead_id: uuid.UUID | None = Field(default=None, index=True)

    # ── Idempotency ───────────────────────────────────────────────────────────
    # Upstream event id (provider-supplied), when the source can give us one —
    # a retried/replayed webhook delivery carries the same external_id, so
    # DarkFunnelService.ingest_signal can dedupe instead of double-counting the
    # signal into research_intensity_score. Nullable: many dark-funnel sources
    # (pixel tracking, manual entry) have no natural event id to dedupe on.
    external_id: str | None = Field(default=None, index=True)

    # ── Signal details ────────────────────────────────────────────────────────
    signal_type: str = Field(index=True, nullable=False)
    source_platform: str | None = Field(
        default=None,
        description="Where we received this signal from (e.g. 'g2', 'website', 'linkedin')",
    )
    content_url: str | None = Field(default=None)
    intent_keywords: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    # ── Anonymisation ─────────────────────────────────────────────────────────
    anonymous: bool = Field(
        default=True,
        description="True = company identified but no specific person known",
    )
    contact_role: str | None = Field(
        default=None,
        description="Role of the person if known (e.g. 'VP Sales', 'IT Manager')",
    )

    # ── Weight (contribution to intensity score) ──────────────────────────────
    weight: float = Field(
        default=5.0,
        description="Signal weight (auto-filled from SIGNAL_WEIGHTS on ingest).",
    )

    # ── Raw payload ───────────────────────────────────────────────────────────
    raw_payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ── Processing ────────────────────────────────────────────────────────────
    processed: bool = Field(default=False, index=True)


class HotLeadScore(TimestampMixin, table=True):
    """Aggregated intent score per company — the core of the Hot Leads dashboard.

    Computed and cached by DarkFunnelService.compute_hot_score(company_domain).
    Updated every time a new DarkFunnelSignal is ingested for this domain.
    """

    __tablename__ = "hot_lead_scores"
    # Uniqueness scoped per-org, not global — same fix as Company.domain
    # (app.models.company): two organizations independently tracking intent
    # signals for the same company domain must each get their own score row.
    __table_args__ = (
        UniqueConstraint("organization_id", "company_domain", name="uq_hot_lead_scores_org_domain"),
    )

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    company_domain: str = Field(index=True, nullable=False)
    company_name: str | None = Field(default=None)
    lead_id: uuid.UUID | None = Field(default=None, index=True)

    # ── Computed score ────────────────────────────────────────────────────────
    research_intensity_score: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        index=True,
        description="0-100 composite intent score. > 70 = Hot lead.",
    )
    buying_stage: str = Field(default=BuyingStage.AWARENESS, index=True)

    # ── Evidence ──────────────────────────────────────────────────────────────
    signal_count: int = Field(default=0)
    signal_types_seen: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    top_intent_keywords: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    last_signal_at: datetime | None = Field(default=None, index=True)
    window_start_at: datetime | None = Field(
        default=None,
        description="Start of the 30-day rolling window used for score computation.",
    )

    # ── Hot lead flag ─────────────────────────────────────────────────────────
    is_hot: bool = Field(default=False, index=True)
    hot_since: datetime | None = Field(default=None)
    alerted: bool = Field(default=False, description="Whether the CEO was notified about this hot lead.")

    def score_to_stage(self) -> str:
        """Map the intensity score to a buying stage label."""
        if self.research_intensity_score >= 80:
            return BuyingStage.READY_TO_BUY
        if self.research_intensity_score >= 55:
            return BuyingStage.DECISION
        if self.research_intensity_score >= 30:
            return BuyingStage.CONSIDERATION
        return BuyingStage.AWARENESS
