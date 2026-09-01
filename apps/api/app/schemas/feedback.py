"""Schemas for the FeedbackLoopService API.

These DTOs define the wire format for recording sales outcomes and for exposing
the learning patterns that the StrategyGeneratorService consumes.

The learning contract
----------------------
``SuccessPattern`` is the unit of knowledge BEE accumulates. When the
StrategyGeneratorService queries "what worked before for deals like this one?",
it receives a ranked list of ``SuccessPattern`` objects — each one a statistically
grounded recommendation backed by real closed deals, not intuition.

The ``confidence`` tier provides a human-readable reliability signal:

* ``low``    (n < 5 deals)  — treat as directional, not conclusive
* ``medium`` (5 ≤ n < 20)  — reliable signal, apply with standard judgment
* ``high``   (n ≥ 20)      — strong signal, should strongly bias generation

This same data will drive the LLM prompt when GPT-4o is wired in:
"In similar contexts, the email channel with post_funding_outreach achieves a
74% win rate across 42 closed deals. Prefer that approach in your strategy."
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# Fixed, small set of loss categories — a picklist, not free text, so Win/Loss
# Analysis can group and count reliably. "other" plus the free-text `notes`
# field below cover anything this list doesn't anticipate; the set can grow
# later (it's a plain string column, not a DB enum) without a migration.
LossReason = Literal[
    "price",
    "budget",
    "timing",
    "competitor",
    "no_decision",
    "lost_champion",
    "product_fit",
    "no_response",
    "other",
]


class OutcomeIn(BaseModel):
    """Request body for recording a sales outcome on an opportunity."""

    outcome: Literal["won", "lost"]
    loss_reason: LossReason | None = Field(
        default=None,
        description="Structured loss category — only meaningful when outcome='lost'.",
    )
    competitor: str | None = Field(
        default=None,
        max_length=200,
        description=(
            "Competitor name — who ultimately won the deal (outcome='lost') or "
            "was beaten (outcome='won'). Optional either way."
        ),
    )
    notes: str | None = Field(
        default=None,
        description="Optional post-mortem or deal notes.",
        max_length=2000,
    )

    @model_validator(mode="after")
    def _loss_reason_requires_lost(self) -> OutcomeIn:
        if self.loss_reason is not None and self.outcome != "lost":
            raise ValueError("loss_reason only applies when outcome='lost'")
        return self


class SuccessPatternOut(BaseModel):
    """A statistically learned success pattern, ready for API exposure.

    Returned by ``GET /api/v1/feedback/patterns?signal_type=funding_round``
    so the frontend can show "what's working" to sales managers.
    """

    signal_type: str
    playbook: str
    channel: str
    generator: str
    win_rate: float = Field(description="0-1 fraction of WON outcomes")
    sample_size: int = Field(description="Number of closed deals this pattern is based on")
    avg_days_to_close: float | None = Field(default=None)
    confidence: Literal["low", "medium", "high"]


class OutcomeOut(BaseModel):
    """Response after recording a sales outcome."""

    opportunity_id: uuid.UUID
    outcome: str
    loss_reason: str | None = None
    competitor: str | None = None
    closed_at: datetime
    message: str = "Outcome recorded"
    # True when this call was a no-op — the outcome was already recorded
    # earlier and the DB was left untouched (see
    # FeedbackLoopService.record_outcome's idempotency guard). The endpoint
    # uses this to skip re-publishing opportunity.won/lost — otherwise every
    # duplicate/retried submission re-fires CRM/billing/outbound-webhook
    # side effects for something that already happened.
    already_recorded: bool = False


# ── Internal learning dataclasses (not exposed directly via API) ───────────────
# These live in schemas rather than services so both the feedback service and
# the strategy generators can import them without circular dependencies.

@dataclass(slots=True)
class SuccessHint:
    """A learned success pattern injected into EnrichmentContext.

    Rule-based generators use this to bias channel/playbook selection.
    LLM generators receive it as a prompt variable:
    "Based on {sample_size} similar deals, {playbook} via {channel}
     achieved a {win_rate:.0%} win rate."
    """

    playbook: str
    channel: str
    generator: str
    win_rate: float
    sample_size: int
    confidence: Literal["low", "medium", "high"]
    avg_days_to_close: float | None = None

    @property
    def is_actionable(self) -> bool:
        """True when we have enough data to act on this hint."""
        return self.confidence in ("medium", "high")

    def to_prompt_text(self) -> str:
        """Format this hint as a natural-language prompt fragment for LLMs."""
        conf_phrase = {
            "low": "a small sample suggests",
            "medium": "data indicates",
            "high": "strong evidence shows",
        }[self.confidence]
        return (
            f"Based on {self.sample_size} similar deals, {conf_phrase} that "
            f"'{self.playbook}' via {self.channel} achieves a "
            f"{self.win_rate:.0%} win rate"
            + (f" (avg. {self.avg_days_to_close:.0f} days to close)" if self.avg_days_to_close else "")
            + "."
        )
