"""What a completed Meeting actually feeds back into BEE — see
Meeting.completed_at's own docstring for why "scheduled" alone doesn't
trigger this and only a confirmed "this actually happened" does.

Called from app/services/events/listeners.py's meeting.completed
handler, never directly from the endpoint — see dispatcher.py for why.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from app.models.base import SignalSource, SignalType
from app.models.lead import Lead
from app.models.meeting import Meeting
from app.models.opportunity import Opportunity
from app.models.signal import Signal

# A completed meeting is real activity worth a permanent record on the
# account's signal timeline, but — unlike a funding round or a key hire —
# it isn't market intelligence BEE detected on its own, so it shouldn't
# spike a score the way those do. Modest and fixed, not a formula: this
# is deliberately not "how good was the meeting" (BEE has no way to know
# that), just "something real happened, worth more than silence".
_MEETING_SIGNAL_SCORE = 35.0


def record_meeting_engagement(session: Session, meeting_id: uuid.UUID) -> None:
    """Increments meetings_held_count on whichever of Opportunity/Lead the
    meeting is directly linked to, and synthesizes an ENGAGEMENT signal
    for that account — the same kind of real, dated activity the rest of
    BEE's scoring already reads off Signal rows, instead of a meeting
    just sitting on the calendar with no trace anywhere else.

    No-op if the meeting can't be found (deleted by the time this runs)
    or is linked to neither an Opportunity nor a Lead — an internal-only
    team sync has nothing to feed back into.
    """
    meeting = session.get(Meeting, meeting_id)
    if meeting is None:
        return

    company_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None

    if meeting.opportunity_id is not None:
        opportunity = session.get(Opportunity, meeting.opportunity_id)
        if opportunity is not None:
            opportunity.meetings_held_count += 1
            session.add(opportunity)
            company_id = opportunity.company_id
            lead_id = opportunity.lead_id

    if meeting.lead_id is not None:
        lead = session.get(Lead, meeting.lead_id)
        if lead is not None:
            lead.meetings_held_count += 1
            session.add(lead)
            company_id = company_id or lead.company_id
            lead_id = lead_id or lead.id

    if company_id is None and lead_id is None:
        return

    session.add(
        Signal(
            organization_id=meeting.organization_id,
            company_id=company_id,
            lead_id=lead_id,
            signal_type=SignalType.ENGAGEMENT,
            source=SignalSource.MANUAL,
            title=f"Reunión completada: {meeting.title}",
            description=meeting.purpose,
            score=_MEETING_SIGNAL_SCORE,
            confidence=1.0,
            raw_payload={"meeting_id": str(meeting.id)},
            analysis={"tags": ["meeting_completed"]},
        )
    )
