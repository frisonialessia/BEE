"""Schemas for the AnomalyDetector API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AnomalyAlertOut(BaseModel):
    id: uuid.UUID
    alert_type: str
    severity: str
    status: str
    segment_type: str
    segment_value: str | None
    rolling_rate: float
    baseline_rate: float
    deviation_pct: float
    sample_size: int
    baseline_sample_size: int
    title: str
    description: str
    recommendation: str
    suggested_actions: list[str]
    pending_action_id: uuid.UUID | None
    acknowledged_at: datetime | None
    resolution_notes: str | None
    resolved_at: datetime | None
    auto_resolved: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AnomalyAcknowledgeRequest(BaseModel):
    notes: str | None = None


class AnomalyCheckResult(BaseModel):
    checked_at: str
    new_alerts: list[AnomalyAlertOut]
    resolved_alerts: list[AnomalyAlertOut]
    open_alerts: list[AnomalyAlertOut]
    summary: str
    checked_segments: int
