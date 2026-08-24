"""Schemas for opportunity follow-up tasks."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OpportunityTaskCreateIn(BaseModel):
    opportunity_id: uuid.UUID
    title: str = Field(min_length=1, max_length=300)
    due_at: datetime | None = None
    # Defaults to the opportunity's own assigned rep when omitted — see
    # app.api.v1.endpoints.opportunity_tasks.create_task.
    assigned_to_user_id: uuid.UUID | None = None


class OpportunityTaskUpdateIn(BaseModel):
    """Partial update — only fields present in the request are applied.

    ``completed`` is a write-only convenience: ``true`` stamps
    ``completed_at`` with now, ``false`` clears it back to open. The reader
    never sends a raw timestamp for this — see the endpoint.
    """

    title: str | None = Field(default=None, min_length=1, max_length=300)
    due_at: datetime | None = None
    assigned_to_user_id: uuid.UUID | None = None
    completed: bool | None = None


class OpportunityTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    opportunity_id: uuid.UUID
    assigned_to_user_id: uuid.UUID | None
    title: str
    due_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
