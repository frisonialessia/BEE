"""Schemas for the WorkflowOrchestrator event bus."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class BeeEvent(BaseModel):
    """A domain event published to the WorkflowOrchestrator.

    Events are named as ``entity.action`` (e.g., ``opportunity.won``,
    ``lead.validated``, ``signal.detected``). Handlers subscribe to specific
    event types via the ``@register_workflow_handler`` decorator.

    The payload is intentionally untyped (``dict``) so new fields can be
    added without breaking existing handlers — handlers extract only what they
    need.
    """

    event_type: str
    entity_id: uuid.UUID | None = None
    entity_type: str | None = None
    payload: dict[str, Any] = {}
    published_at: datetime | None = None


class WorkflowTaskOut(BaseModel):
    """API representation of a dispatched workflow task."""

    id: uuid.UUID
    event_type: str
    entity_id: uuid.UUID | None
    handler_name: str
    status: str
    mock: bool
    payload: dict[str, Any]
    result: dict[str, Any] | None
    dispatched_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkflowStatusOut(BaseModel):
    """Summary of workflow task activity."""

    total_tasks: int
    dispatched: int
    mock_dispatched: int
    completed: int
    failed: int
    skipped: int
    pending: int
