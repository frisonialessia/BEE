"""Schemas for the ExecutiveAgent API.

``ArtifactBundle`` is what the frontend renders for the "One-Click Action" UX:
a set of immediately usable execution artifacts (email draft, meeting agenda,
action plan) that the sales rep can send or copy with minimal editing.

Frontend contract
-----------------
The bundle is designed so each artifact can be rendered as a standalone card:

* ``EmailDraftArtifact`` → a rich email composer pre-filled with subject, body,
  and a P.S. line. One button sends it.
* ``MeetingStructureArtifact`` → a meeting agenda the rep pastes into the invite.
* ``NextStepsArtifact`` → an ordered action plan with owners and deadlines.

Webhook / n8n integration
--------------------------
When the ExecutiveAgent emits a ``ARTIFACTS_GENERATED`` event, it POSTs this
same bundle to the configured ``WEBHOOK_EXECUTION_URL``. n8n / Zapier / Make
can listen and trigger: sending the email via SMTP, creating a CRM task,
scheduling the meeting, or notifying the rep via Slack.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class EmailDraftArtifact(BaseModel):
    """A ready-to-send cold outreach email.

    Every field maps to a standard email composer UI element so the frontend
    can render it with zero transformation.
    """

    artifact_type: Literal["email_draft"] = "email_draft"
    subject: str = Field(description="Email subject line — attention-grabbing, specific")
    body: str = Field(description="Full email body in plain text")
    ps_line: str | None = Field(
        default=None,
        description="Optional P.S. line — often the most-read part of a cold email",
    )
    recommended_send_time: str | None = Field(
        default=None,
        description="e.g. 'Tuesday 9-10 AM recipient local time'",
    )
    estimated_read_time_seconds: int = Field(default=30)


class AgendaItem(BaseModel):
    """One item in a meeting agenda."""

    duration_minutes: int
    title: str
    notes: str | None = None


class MeetingStructureArtifact(BaseModel):
    """A structured meeting agenda — paste directly into the calendar invite."""

    artifact_type: Literal["meeting_structure"] = "meeting_structure"
    meeting_title: str
    total_duration_minutes: int
    objective: str = Field(description="One-sentence goal of the meeting")
    agenda_items: list[AgendaItem] = Field(default_factory=list)
    pre_meeting_prep: list[str] = Field(
        default_factory=list,
        description="Things the rep should do/know before the call",
    )
    success_criteria: str = Field(description="How will we know this meeting was successful?")


class ActionItem(BaseModel):
    """A single next-step action with an owner and timing."""

    action: str
    owner: Literal["rep", "lead", "both"] = "rep"
    timing: str = Field(description="e.g. 'within 24h', 'before next meeting'")
    priority: Literal["high", "medium", "low"] = "medium"


class NextStepsArtifact(BaseModel):
    """An ordered action plan — the execution roadmap for this opportunity."""

    artifact_type: Literal["next_steps"] = "next_steps"
    horizon: str = Field(description="e.g. 'Next 7 days', 'Before Q3 close'")
    actions: list[ActionItem] = Field(default_factory=list)
    key_risk: str | None = Field(
        default=None, description="The biggest risk that could kill this deal"
    )
    success_milestone: str | None = Field(
        default=None, description="The one event that would confirm momentum"
    )


class ArtifactBundle(BaseModel):
    """The complete set of execution artifacts for one opportunity.

    Returned by ``GET /api/v1/opportunities/{id}/artifacts``.
    Posted to the execution webhook so n8n/Zapier can act on it.
    """

    opportunity_id: uuid.UUID
    generated_at: datetime
    generator: str = Field(description="Which artifact generator produced this bundle")

    email_draft: EmailDraftArtifact
    meeting_structure: MeetingStructureArtifact
    next_steps: NextStepsArtifact

    # Raw context snapshot so external tools have full context without
    # making additional API calls.
    context_snapshot: dict[str, Any] = Field(default_factory=dict)


class ArtifactEventPayload(BaseModel):
    """Webhook payload emitted when artifacts are generated.

    External tools (n8n, Zapier, Make) receive this and can trigger:
    - Send the email via SMTP/SendGrid
    - Create a CRM task/deal
    - Schedule the meeting
    - Notify the rep via Slack/Teams
    """

    event_type: Literal["artifacts.generated"] = "artifacts.generated"
    opportunity_id: uuid.UUID
    timestamp: datetime
    bundle: ArtifactBundle
