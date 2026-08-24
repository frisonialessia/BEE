"""Schemas for org-configured outbound webhooks."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# The full catalog of event types WorkflowOrchestrator actually publishes
# today — see app.services.workflow_orchestrator.handlers's module
# docstring. Kept here (not imported from there) so this schema has no
# import-time dependency on the handler registry; extend both when a new
# event type is added.
AVAILABLE_EVENT_TYPES = [
    "opportunity.won",
    "opportunity.lost",
    "opportunity.ready_to_action",
]


class OutboundWebhookCreateIn(BaseModel):
    url: str = Field(min_length=1, max_length=1000)
    event_types: list[str] = Field(min_length=1)
    # Auto-generated when omitted — see the endpoint. Letting the caller
    # supply their own is useful when they're re-registering a webhook whose
    # receiving side already expects a known secret.
    secret: str | None = Field(default=None, min_length=16, max_length=200)


class OutboundWebhookUpdateIn(BaseModel):
    """Partial update — only fields present in the request are applied."""

    url: str | None = Field(default=None, min_length=1, max_length=1000)
    event_types: list[str] | None = Field(default=None, min_length=1)
    is_active: bool | None = None


class OutboundWebhookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    event_types: list[str]
    is_active: bool
    secret_preview: str
    last_triggered_at: datetime | None
    last_status: str | None
    failure_count: int
    created_at: datetime


class OutboundWebhookCreated(OutboundWebhookOut):
    """Returned once, at creation time — the only moment the plaintext secret exists."""

    secret: str
