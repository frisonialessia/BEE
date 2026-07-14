"""Schemas for the SmartEngagementEngine API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class IncomingEventIn(BaseModel):
    """Payload for submitting an incoming engagement event to BEE."""

    source: str = Field(description="linkedin | twitter | email | slack")
    content: str = Field(min_length=1, max_length=5000, description="The raw message/comment text")
    author_name: str | None = None
    author_handle: str | None = None
    author_profile_url: str | None = None
    context_post: str | None = Field(default=None, description="The CEO's original post this responds to")
    source_event_id: str | None = Field(default=None, description="Native platform event ID (for dedup)")
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class EngagementAnalysis(BaseModel):
    """Result of SmartEngagementEngine.analyze()."""

    event_id: uuid.UUID
    source: str
    author_name: str | None
    content: str
    sentiment: str
    intent: str
    confidence: float
    analysis_notes: str | None
    response_draft: str | None
    pending_action_id: uuid.UUID | None
    processed: bool
    ignored: bool


class EngagementEventOut(BaseModel):
    id: uuid.UUID
    source: str
    author_name: str | None
    author_handle: str | None
    content: str
    sentiment: str
    intent: str
    analysis_confidence: float
    analysis_notes: str | None
    response_draft: str | None
    pending_action_id: uuid.UUID | None
    processed: bool
    ignored: bool
    created_at: datetime

    model_config = {"from_attributes": True}
