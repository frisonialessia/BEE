"""Schemas for A/B TacticVariant API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.base import VariantStatus


class ArmConfig(BaseModel):
    """Configuration for one arm of a tactic variant."""

    channel: str | None = Field(default=None, examples=["email", "linkedin"])
    playbook: str | None = Field(default=None, examples=["post_funding_outreach"])
    urgency_override: str | None = Field(default=None, examples=["immediate", "this_week"])
    next_best_action: str | None = Field(default=None, examples=["reach_out", "monitor"])


class VariantCreateIn(BaseModel):
    """Request body to create a new A/B tactic variant."""

    name: str
    description: str | None = None
    hypothesis: str | None = None
    signal_type: str
    industry: str | None = None
    arm_a_config: ArmConfig
    arm_b_config: ArmConfig
    traffic_split: float = Field(default=0.5, ge=0.0, le=1.0)
    min_samples_per_arm: int = Field(default=10, ge=5)


class VariantOut(BaseModel):
    """Full A/B variant state with live stats."""

    id: uuid.UUID
    name: str
    description: str | None
    hypothesis: str | None
    signal_type: str
    industry: str | None
    arm_a_config: dict[str, Any]
    arm_b_config: dict[str, Any]
    traffic_split: float
    min_samples_per_arm: int
    status: VariantStatus
    winner_arm: str | None
    arm_a_wins: int
    arm_a_total: int
    arm_b_wins: int
    arm_b_total: int
    arm_a_win_rate: float
    arm_b_win_rate: float
    is_ready_to_conclude: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ActiveVariantRef(BaseModel):
    """Lightweight reference passed in EnrichmentContext."""

    variant_id: uuid.UUID
    arm: str  # "a" | "b"
    config: dict[str, Any]
