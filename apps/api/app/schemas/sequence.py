"""Schemas for the DynamicSequenceEngine API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class StepTransition(BaseModel):
    """A conditional edge in the sequence DAG."""

    condition: str = Field(description="Event name that triggers this transition (e.g. 'email_opened')")
    next_step_id: str | None = Field(
        default=None,
        description="ID of the next step. None means complete the sequence.",
    )
    delay_days: int = Field(default=0, description="Days to wait before advancing after condition is met")


class StepDefinition(BaseModel):
    """One node in the sequence DAG."""

    id: str = Field(description="Unique ID within this sequence (e.g. 's1', 's2a')")
    name: str = Field(description="Human-readable step name")
    action: str = Field(description="Action type: send_email | linkedin_connect | book_meeting | send_content")
    artifact_type: str | None = Field(default=None, description="Artifact template to use")
    channel: str | None = Field(default=None, description="Override channel: email | linkedin | twitter")
    transitions: list[StepTransition] = Field(default_factory=list)
    fallback_step_id: str | None = Field(
        default=None,
        description="Step to advance to if no transitions match after max_wait_days",
    )
    max_wait_days: int = Field(default=7, description="Days to wait for a transition event before using fallback")
    notes: str | None = None


class SequenceCreate(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    description: str | None = None
    signal_type: str | None = None
    industry: str | None = None
    entry_step_id: str = "s1"
    steps: list[StepDefinition] = Field(min_length=1)
    max_days: int = Field(default=30, ge=1, le=180)


class SequenceOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    signal_type: str | None
    industry: str | None
    entry_step_id: str
    steps: list[dict[str, Any]]
    max_days: int
    status: str
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExecutionCreate(BaseModel):
    """Start a sequence execution for a specific lead/opportunity."""

    sequence_id: uuid.UUID
    opportunity_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None


class ExecutionAdvance(BaseModel):
    """Record an engagement event and advance the sequence."""

    event: str = Field(description="e.g. 'email_opened', 'link_clicked', 'replied'")
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExecutionOut(BaseModel):
    id: uuid.UUID
    sequence_id: uuid.UUID
    opportunity_id: uuid.UUID | None
    lead_id: uuid.UUID | None
    current_step_id: str
    status: str
    events: list[dict[str, Any]]
    pending_action_ids: list[str]
    started_at: datetime
    last_advanced_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdvanceResult(BaseModel):
    """Result of advancing a sequence execution."""

    execution_id: uuid.UUID
    previous_step: str
    current_step: str | None
    status: str
    transition_triggered: str | None
    pending_action_created: bool
    message: str
