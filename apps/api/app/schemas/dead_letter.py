"""Schemas for the DeadLetterQueue API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DLQEventOut(BaseModel):
    id: uuid.UUID
    event_type: str
    event_name: str
    opportunity_id: uuid.UUID | None
    lead_id: uuid.UUID | None
    pending_action_id: uuid.UUID | None
    attempt_count: int
    last_error: str | None
    error_history: list[dict[str, Any]]
    status: str
    next_retry_at: datetime | None
    last_attempted_at: datetime | None
    resolved_at: datetime | None
    resolution_notes: str | None
    ceo_alerted: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DLQRetryResult(BaseModel):
    event_id: uuid.UUID
    success: bool
    status: str
    message: str
    attempt_count: int
    next_retry_at: datetime | None = None


class DLQResolveRequest(BaseModel):
    notes: str | None = Field(default=None, description="Optional notes about how this was resolved")


class DLQSummary(BaseModel):
    total_events: int
    pending_count: int
    retrying_count: int
    resolved_count: int
    permanently_failed_count: int
    due_for_retry_count: int
    ceo_alerted_count: int


class DLQEnqueueRequest(BaseModel):
    """Manually enqueue a test event (for integration testing)."""

    event_name: str
    event_type: str = "webhook"
    original_event: dict[str, Any] = Field(default_factory=dict)
    error_message: str = "Manual test enqueue"
    opportunity_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None
