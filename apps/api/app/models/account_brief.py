"""AccountBrief — a persistent, standing research brief for one company.

Distinct from a Signal: a Signal is "something just happened" (a discrete
event, market-scan pass or webhook). An AccountBrief is "who is this
company, synthesized from everything BEE could find about them right now" —
a standing artifact meant to be read, reused, and fed into future strategy
generation, not a queue item.

Produced by AccountResearchAgent (see app.services.account_research), which
runs the same multi-provider pass MarketScanOrchestrator uses for signals
(website, hiring, market news) but synthesizes the results into one prose
summary instead of turning each into a separate Signal row. See that
service's module docstring for the trigger/cache/budget discipline that
keeps this from being called on every company at once.

One company can accumulate multiple rows over time (research reruns after
the TTL expires, or a human explicitly re-triggers it) — the most recent
row for a company is "the" current brief; older ones are kept as history,
not superseded/deleted, same append-only spirit as AuditEntry.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class AccountBrief(TimestampMixin, table=True):
    """One synthesized research pass over a single company."""

    __tablename__ = "account_briefs"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True, nullable=False)

    # The prose synthesis — what a rep actually reads. Either LLM-written
    # (grounded strictly in `findings` below, see AccountResearchAgent) or,
    # when AI_PROVIDER=none, a deterministic template built from the same
    # data — never fabricated beyond what a provider actually returned.
    summary: str = Field(nullable=False)

    # Structured raw results per provider — {"website": {...}, "hiring":
    # {...}, "market_news": {...}} — kept alongside the prose summary so a
    # future re-synthesis (a better prompt, a new AI_PROVIDER) never needs
    # to re-fetch from providers, only re-summarize this row.
    findings: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Which providers actually returned something (vs. were called but
    # empty) — lets the UI show "based on: hiring, market news" instead of
    # implying every provider contributed.
    sources: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    # "llm" | "template" — which path produced `summary`, for the same
    # transparency reason ExecutiveAgent's artifacts record their generator.
    generated_by: str = Field(default="template")
    model_used: str | None = Field(default=None)
