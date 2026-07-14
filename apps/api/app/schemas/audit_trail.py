"""Schemas for the AuditTrailService API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditEntryOut(BaseModel):
    id: uuid.UUID
    agent_type: str
    decision_type: str
    session_id: str | None
    opportunity_id: uuid.UUID | None
    lead_id: uuid.UUID | None
    signal_id: uuid.UUID | None
    pending_action_id: uuid.UUID | None
    context_snapshot: dict[str, Any]
    market_data_used: dict[str, Any]
    strategy_reasoning: str | None
    output_snapshot: dict[str, Any]
    confidence_score: float
    manual_review_required: bool
    processing_ms: int | None
    generator_name: str | None
    generator_version: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditSummary(BaseModel):
    total_entries: int
    manual_review_count: int
    avg_confidence_score: float
    entries_by_agent: dict[str, int]
    entries_by_decision: dict[str, int]


class AuditDecisionChain(BaseModel):
    """The full decision chain for an opportunity — all agent decisions in order."""

    opportunity_id: uuid.UUID
    entries: list[AuditEntryOut]
    total_entries: int
    has_low_confidence: bool
    requires_review: bool
