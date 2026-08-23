"""StrategyOutcome — the memory of BEE.

Every time a sales opportunity is closed (WON or LOST), a ``StrategyOutcome``
row is created. It captures the full context of the strategy that was used:
signal type, company industry, lead seniority, channel, playbook, and the
generator that produced it. This creates a training dataset for the
``FeedbackLoopService``.

Why denormalize?
----------------
The row is deliberately self-contained (it duplicates context from Signal,
Company, Lead, and Strategy) so that:
1. Analytics queries are simple O(1) aggregations, not multi-table joins.
2. The record remains valid even if the originating entities are archived.
3. An LLM fine-tuning pipeline can treat each row as an independent example.

This is BEE's competitive moat: a growing, labeled dataset of "what strategies
win in which contexts", which future ML models can train on directly.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import OpportunityStatus, TimestampMixin, new_uuid


class StrategyOutcome(TimestampMixin, table=True):
    """One closed opportunity, fully denormalized for analytics.

    The ``outcome`` field drives all learning — WON rows teach what works,
    LOST rows teach what doesn't. Everything else is context the
    ``FeedbackLoopService`` uses to find statistically similar situations.
    """

    __tablename__ = "strategy_outcomes"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )

    # ── Origin ─────────────────────────────────────────────────────────────
    opportunity_id: uuid.UUID = Field(index=True, nullable=False)
    signal_id: uuid.UUID | None = Field(default=None, index=True)

    # ── Outcome ────────────────────────────────────────────────────────────
    outcome: str = Field(index=True, nullable=False)  # "won" | "lost"
    closed_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    # Days from opportunity creation to close. Negative means immediate close.
    days_to_close: int | None = Field(default=None)
    # Score the opportunity had when it was closed (for quality analysis).
    score_at_close: float = Field(default=0.0)

    # ── Signal context (denormalized for analytics) ─────────────────────────
    signal_type: str = Field(index=True, nullable=False)

    # ── Entity context ──────────────────────────────────────────────────────
    company_industry: str | None = Field(default=None, index=True)
    industry: str | None = Field(default=None, index=True, description="Alias for company_industry — used by analytics queries")
    company_domain: str | None = Field(default=None)
    lead_seniority: str | None = Field(default=None, index=True)
    lead_title: str | None = Field(default=None)

    # ── Deal financials ──────────────────────────────────────────────────────
    deal_value: float | None = Field(default=None, description="Deal value in EUR when closed WON")
    cycle_days: int | None = Field(default=None, description="Total days from signal to close")

    # ── Strategy that was used ──────────────────────────────────────────────
    playbook: str = Field(index=True, nullable=False)
    channel: str = Field(index=True, nullable=False)
    generator: str = Field(index=True, nullable=False)
    generator_version: str = Field(nullable=False)

    # ── Free-form notes (human or AI-generated post-mortem) ─────────────────
    notes: str | None = Field(default=None)

    # ── Full strategy snapshot (for LLM fine-tuning dataset) ────────────────
    strategy_snapshot: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )

    @property
    def is_won(self) -> bool:
        return self.outcome == OpportunityStatus.WON.value
