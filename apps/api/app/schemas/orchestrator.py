"""Schemas for the AgentOrchestrator API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.base import ActionStatus, ActionType


class PendingActionOut(BaseModel):
    """API representation of a pending action — what n8n/Zapier reads."""

    id: uuid.UUID
    opportunity_id: uuid.UUID
    action_type: ActionType
    status: ActionStatus
    title: str
    description: str | None
    preview: str | None
    payload: dict[str, Any]
    priority: int
    retry_count: int
    approved_by: str | None
    approved_at: datetime | None
    completed_at: datetime | None
    failure_reason: str | None
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApprovalIn(BaseModel):
    """Request body for approving a pending action."""

    approved_by: str = Field(
        ...,
        description="Identifier of the approver (email, user ID, or 'system')",
        examples=["ceo@acme.com"],
    )


class RejectionIn(BaseModel):
    """Request body for rejecting a pending action."""

    reason: str | None = Field(
        default=None,
        description="Why the action was rejected",
        max_length=500,
    )


class ExecutionStartIn(BaseModel):
    """Request body for marking an action as executing."""

    tool: str = Field(
        ...,
        description="Name of the tool executing the action (e.g. 'n8n', 'zapier')",
        examples=["n8n"],
    )


class ExecutionCompleteIn(BaseModel):
    """Request body for marking an action as completed."""

    result_summary: str | None = Field(default=None, max_length=1000)


class ExecutionFailedIn(BaseModel):
    """Request body for marking an action as failed."""

    reason: str = Field(..., max_length=1000)
    retry: bool = Field(default=False, description="If True, requeue as PENDING_APPROVAL")


class OrchestratorStatusOut(BaseModel):
    """Dashboard summary of the orchestrator queue."""

    total_pending: int
    total_approved: int
    total_executing: int
    total_completed: int
    total_failed: int
    total_rejected: int
