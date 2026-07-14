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

from pydantic import BaseModel, Field


class OutcomeIn(BaseModel):
    """Request body for recording a sales outcome on an opportunity."""

    outcome: Literal["won", "lost"]
    notes: str | None = Field(
        default=None,
        description="Optional post-mortem or deal notes.",
        max_length=2000,
    )


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
    closed_at: datetime
    message: str = "Outcome recorded"


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
