"""Meeting entity — a scheduled call/meeting on the shared team calendar.

Deliberately its own model, not an extension of OpportunityTask: a task is
"something a rep sets for themselves and checks off by hand" (see
OpportunityTask's own docstring) — a meeting has attendees (plural, other
team members), a duration, and a join link, none of which fit that shape.
Optionally linked to an Opportunity or a Lead so the calendar can show
"who this meeting is with" using data BEE already has (pipeline stage,
lead score) instead of asking the rep to re-classify the same account by
hand every time they schedule something — see MeetingOut.client_context.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover
    from app.models.lead import Lead
    from app.models.opportunity import Opportunity


class Meeting(TimestampMixin, table=True):
    """A scheduled meeting, optionally tied to a pipeline account."""

    __tablename__ = "meetings"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    created_by_user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)

    # At most one of these is normally set — whichever exists yet for this
    # account. Both nullable: an internal-only team sync has neither.
    opportunity_id: uuid.UUID | None = Field(
        default=None, foreign_key="opportunities.id", index=True
    )
    lead_id: uuid.UUID | None = Field(default=None, foreign_key="leads.id", index=True)

    title: str = Field(nullable=False, max_length=300)
    # What the meeting is for — shown on the calendar card, not required
    # (an internal team sync doesn't need one).
    purpose: str | None = Field(default=None, max_length=2000)
    starts_at: datetime = Field(nullable=False, index=True)
    duration_minutes: int = Field(default=30)
    meeting_url: str | None = Field(default=None, max_length=1000)
    # Internal teammates invited (user ids) — the calendar's own "everyone
    # who needs to see this" list, separate from created_by_user_id so a
    # meeting a manager books still shows up on the rep's calendar too.
    attendee_user_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    # Personal color tag, picked freely by whoever creates the meeting —
    # purely organizational (unlike client_context, which BEE derives and
    # nothing picks by hand). One of app.schemas.meeting.MEETING_COLORS —
    # a token name (e.g. "chart-1"), not a raw hex, so it resolves through
    # the same CSS custom properties everything else in the UI already
    # uses and adapts to dark mode automatically. Null falls back to the
    # client_context-based tone the calendar already had.
    color: str | None = Field(default=None, max_length=20)

    # Set once, by POST /meetings/{id}/complete — NULL means "hasn't
    # happened yet (or nobody's said it did)", never inferred from
    # starts_at + duration having passed: a rep confirming it actually
    # took place is what's meaningful here, not just the clock. This is
    # the trigger for feeding a meeting back into the rest of BEE's data
    # (Lead/Opportunity.meetings_held_count, an "engagement" Signal) — see
    # app/services/events/listeners.py's meeting.completed handler.
    completed_at: datetime | None = Field(default=None)

    opportunity: "Opportunity" = Relationship()
    lead: "Lead" = Relationship()
