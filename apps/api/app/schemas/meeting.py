"""Schemas for the team calendar (Meeting)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# "Ligado al cerebro de BEE": what kind of account this meeting is with,
# derived server-side from the linked Opportunity/Lead's own existing data
# (opportunity_type, OpportunityStatus, Lead.score) rather than asked of the
# rep by hand — see app.api.v1.endpoints.meetings._client_context. Mirrors
# the vocabulary from the request: "cliente ya" (active_client), "lead
# caliente" (hot_lead), "prospecto" (prospect), "primera vez" (new_contact).
ClientContext = Literal["active_client", "hot_lead", "prospect", "new_contact"]

# Personal color tag — picked freely by whoever creates the meeting, purely
# organizational (unlike ClientContext, which BEE derives and nothing picks
# by hand). Token names resolving through the same CSS custom properties
# the rest of the UI already uses (--color-chart-1..6), not raw hex, so a
# theme change or dark mode never needs this list touched.
MeetingColor = Literal[
    "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6",
    # The sales greens (--color-green-1..3): a closing or client meeting.
    "green-1", "green-2", "green-3",
]

AttendeeResponse = Literal["accepted", "declined"]


class MeetingRespondIn(BaseModel):
    response: AttendeeResponse


class MeetingCreateIn(BaseModel):
    opportunity_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=300)
    purpose: str | None = Field(default=None, max_length=2000)
    starts_at: datetime
    duration_minutes: int = Field(default=30, ge=5, le=480)
    meeting_url: str | None = Field(default=None, max_length=1000)
    attendee_user_ids: list[uuid.UUID] = Field(default_factory=list)
    color: MeetingColor | None = None


class MeetingUpdateIn(BaseModel):
    """Partial update — only fields present in the request are applied."""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    purpose: str | None = None
    starts_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=480)
    meeting_url: str | None = None
    attendee_user_ids: list[uuid.UUID] | None = None
    color: MeetingColor | None = None


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_by_user_id: uuid.UUID
    opportunity_id: uuid.UUID | None
    lead_id: uuid.UUID | None
    title: str
    purpose: str | None
    starts_at: datetime
    duration_minutes: int
    meeting_url: str | None
    attendee_user_ids: list[str]
    attendee_responses: dict[str, str] = Field(default_factory=dict)
    color: str | None
    completed_at: datetime | None = None
    created_at: datetime

    # Denormalized at read time (see the endpoint) so the calendar can
    # render "who this is with" and its BEE-derived context with no extra
    # round trip per meeting card.
    company_name: str | None = None
    contact_name: str | None = None
    client_context: ClientContext | None = None
