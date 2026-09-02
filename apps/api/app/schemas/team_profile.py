"""Schemas for TeamProfile — per-team signal weighting and research focus."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class TeamProfileIn(BaseModel):
    """Replaces a team's profile wholesale — same "replace, don't patch"
    convention as VoiceProfileCreate."""

    signal_weights: dict[str, float] = Field(
        default_factory=dict,
        description="SignalType value -> ranking multiplier (0-5). Unknown "
        "keys or out-of-range values are silently ignored when applied, "
        "same 'empty/unknown = no opinion' rule as icp_criteria.",
    )
    research_focus: str | None = Field(default=None, max_length=2000)

    @field_validator("signal_weights")
    @classmethod
    def _clamp_weights(cls, value: dict[str, float]) -> dict[str, float]:
        """Reject a pathological weight outright rather than silently
        clamping it — a typo like 500 instead of 5.0 should surface to the
        caller, not quietly reshape ranking."""
        for key, weight in value.items():
            if not (0.0 <= weight <= 5.0):
                raise ValueError(f"signal_weights[{key!r}]={weight} must be between 0 and 5")
        return value


class TeamProfileOut(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    signal_weights: dict[str, float]
    research_focus: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
