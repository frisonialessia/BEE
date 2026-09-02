"""Schemas for AutopilotConfig — per-organization autonomous-execution guardrails."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class AutopilotConfigIn(BaseModel):
    """Replaces the org's autopilot config wholesale — same "replace, don't
    patch" convention as VoiceProfileCreate/TeamProfileIn."""

    enabled: bool = False
    confidence_threshold: float = Field(default=0.9, ge=0.5, le=1.0)
    excluded_company_ids: list[uuid.UUID] = Field(default_factory=list, max_length=1000)
    forbidden_words: list[str] = Field(default_factory=list, max_length=200)


class AutopilotConfigOut(BaseModel):
    """Deliberately no id/timestamps — same minimalism as ICPCriteriaOut.
    "Never configured" and "configured with every field at its default"
    read identically (enabled=False, threshold=0.9, both lists empty),
    exactly like ICPCriteriaOut's "empty lists = not configured yet"."""

    enabled: bool
    confidence_threshold: float
    excluded_company_ids: list[str]
    forbidden_words: list[str]

    model_config = {"from_attributes": True}


# ── Guardrail Backtesting Sandbox ────────────────────────────────────────────
# See AutopilotGuardrailService.run_simulation for the full rationale: this
# replays a *candidate* config against real history so an org owner can see
# projected impact before raising confidence_threshold in production.


class AutopilotSimulationRequest(BaseModel):
    """The config to backtest — same guardrail fields as AutopilotConfigIn,
    minus ``enabled``: a simulation always asks "what would happen if this
    were active", so there is nothing for an ``enabled`` flag to toggle."""

    confidence_threshold: float = Field(default=0.9, ge=0.5, le=1.0)
    excluded_company_ids: list[uuid.UUID] = Field(default_factory=list, max_length=1000)
    forbidden_words: list[str] = Field(default_factory=list, max_length=200)
    lookback_days: int = Field(
        default=90, ge=1, le=730, description="How far back to replay history."
    )


class AutopilotSimulationSample(BaseModel):
    """One historical Opportunity replayed through the candidate config."""

    opportunity_id: uuid.UUID
    company_id: uuid.UUID | None
    would_auto_approve: bool
    reason: str
    confidence_score: float
    # "won" | "lost" | None (still open / not yet closed)
    outcome: str | None


class AutopilotSimulationReport(BaseModel):
    """Projected impact of the candidate config over the lookback window.

    ``*_win_rate`` fields are ``None`` (never 0.0) when there are zero closed
    outcomes in that bucket — "no data yet" must never be misread as "0%
    win rate", the same "missing != zero" rule ``FeedbackLoopService``
    follows for win-rate aggregation elsewhere in this codebase.
    """

    lookback_days: int
    evaluated_count: int
    would_auto_approve_count: int
    would_auto_approve_rate: float

    auto_approved_won: int
    auto_approved_lost: int
    auto_approved_still_open: int
    auto_approved_win_rate: float | None

    manual_review_won: int
    manual_review_lost: int
    manual_review_still_open: int
    manual_review_win_rate: float | None

    # Opportunities on the excluded list whose confidence score would
    # otherwise have cleared the bar — i.e. protection that actually did
    # something, not a dead setting.
    near_miss_excluded_count: int

    # Capped, highest-confidence-first — a full replay can be thousands of
    # rows; this is for spot-checking, the aggregates above are the verdict.
    samples: list[AutopilotSimulationSample]
