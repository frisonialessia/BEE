"""Team calendar — meetings.

Deliberately flat (``/meetings``, not nested under ``/opportunities/{id}``),
same rationale as ``/tasks`` (opportunity_tasks.py): a single ``GET
/meetings`` (optionally date-ranged) doubles as both "meetings for this
account" and "my calendar this week" without two route shapes.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_session
from app.models.base import EXPANSION, RENEWAL_RISK, OpportunityStatus
from app.models.company import Company
from app.models.lead import Lead
from app.models.meeting import Meeting
from app.models.opportunity import Opportunity
from app.models.user import User
from app.schemas.meeting import ClientContext, MeetingCreateIn, MeetingOut, MeetingUpdateIn
from app.services.permissions import get_visible_user_ids, scope_by_organization_id

router = APIRouter(prefix="/meetings", tags=["Meetings"])

# Mirrors the frontend's own "hot lead" convention (dashboard-overview.tsx,
# leads-directory.tsx: score >= 75) — no shared backend constant exists yet
# for it, same duplication those two call sites already accept.
_HOT_LEAD_SCORE_THRESHOLD = 75


def _hidden_from(session: Session, current_user: User | None, meeting: Meeting) -> bool:
    """Tenant boundary, then assignment — same two-step shape as every
    other ``_hidden_from`` in this codebase (tasks/opportunities/leads).
    An explicit attendee always sees it, even outside their manager
    hierarchy — being invited overrides the usual visibility rule, the same
    way a meeting invite works anywhere else."""
    if current_user is None:
        return False
    if meeting.organization_id is not None and meeting.organization_id != current_user.organization_id:
        return True
    if str(current_user.id) in meeting.attendee_user_ids or meeting.created_by_user_id == current_user.id:
        return False
    visible = get_visible_user_ids(session, current_user)
    return visible is not None and meeting.created_by_user_id not in visible


def _client_context(opportunity: Opportunity | None, lead: Lead | None) -> ClientContext | None:
    """Derive "what kind of account is this" from data BEE already has —
    see ClientContext's own docstring for the vocabulary this maps to."""
    if opportunity is not None:
        if opportunity.status == OpportunityStatus.WON or opportunity.opportunity_type in (
            EXPANSION,
            RENEWAL_RISK,
        ):
            return "active_client"
        return "prospect"
    if lead is not None:
        return "hot_lead" if lead.score >= _HOT_LEAD_SCORE_THRESHOLD else "prospect"
    return "new_contact"


def _to_out(session: Session, meeting: Meeting) -> MeetingOut:
    opportunity = session.get(Opportunity, meeting.opportunity_id) if meeting.opportunity_id else None
    lead = session.get(Lead, meeting.lead_id) if meeting.lead_id else None
    if lead is None and opportunity is not None and opportunity.lead_id:
        lead = session.get(Lead, opportunity.lead_id)

    company_id = (opportunity.company_id if opportunity else None) or (lead.company_id if lead else None)
    company = session.get(Company, company_id) if company_id else None

    return MeetingOut(
        **meeting.model_dump(),
        company_name=company.name if company else None,
        contact_name=lead.full_name if lead else None,
        client_context=_client_context(opportunity, lead),
    )


@router.post(
    "",
    response_model=MeetingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule a meeting on the team calendar",
)
def create_meeting(
    data: MeetingCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MeetingOut:
    if data.opportunity_id is not None:
        opportunity = session.get(Opportunity, data.opportunity_id)
        if opportunity is None or (
            opportunity.organization_id is not None
            and opportunity.organization_id != current_user.organization_id
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    if data.lead_id is not None:
        lead = session.get(Lead, data.lead_id)
        if lead is None or (
            lead.organization_id is not None and lead.organization_id != current_user.organization_id
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    meeting = Meeting(
        organization_id=current_user.organization_id,
        created_by_user_id=current_user.id,
        opportunity_id=data.opportunity_id,
        lead_id=data.lead_id,
        title=data.title,
        purpose=data.purpose,
        starts_at=data.starts_at,
        duration_minutes=data.duration_minutes,
        meeting_url=data.meeting_url,
        attendee_user_ids=[str(uid) for uid in data.attendee_user_ids],
        color=data.color,
    )
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return _to_out(session, meeting)


@router.get(
    "",
    response_model=list[MeetingOut],
    summary="List meetings visible to the caller, optionally date-ranged",
)
def list_meetings(
    starts_after: datetime | None = None,
    starts_before: datetime | None = None,
    opportunity_id: uuid.UUID | None = None,
    lead_id: uuid.UUID | None = None,
    limit: int = Query(default=200, le=500),
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[MeetingOut]:
    statement = select(Meeting)

    organization_id = current_user.organization_id if current_user else None
    statement = scope_by_organization_id(statement, Meeting.organization_id, organization_id)

    if starts_after is not None:
        statement = statement.where(Meeting.starts_at >= starts_after)
    if starts_before is not None:
        statement = statement.where(Meeting.starts_at <= starts_before)
    if opportunity_id is not None:
        statement = statement.where(Meeting.opportunity_id == opportunity_id)
    if lead_id is not None:
        statement = statement.where(Meeting.lead_id == lead_id)

    statement = statement.order_by(Meeting.starts_at.asc())  # type: ignore[union-attr]

    meetings = list(session.exec(statement).all())

    # Visibility filter applied in Python, not SQL: attendee_user_ids is a
    # plain JSON list, and "does this JSON array contain X" isn't a
    # portable SQL operator across SQLite (tests) and Postgres (prod) the
    # way an IN filter on a real FK column is — a date-ranged calendar
    # query is small enough per organization that this doesn't need to be
    # a database-level filter to stay fast.
    if current_user is not None:
        visible_user_ids = get_visible_user_ids(session, current_user)
        if visible_user_ids is not None:
            visible_strs = {str(uid) for uid in visible_user_ids} | {str(current_user.id)}
            meetings = [
                m
                for m in meetings
                if m.created_by_user_id in visible_user_ids
                or any(uid in visible_strs for uid in m.attendee_user_ids)
            ]

    meetings = meetings[offset : offset + limit]
    return [_to_out(session, m) for m in meetings]


@router.get(
    "/{meeting_id}",
    response_model=MeetingOut,
    summary="Fetch a single meeting by id",
)
def get_meeting(
    meeting_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> MeetingOut:
    meeting = session.get(Meeting, meeting_id)
    if meeting is None or _hidden_from(session, current_user, meeting):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found.")
    return _to_out(session, meeting)


@router.patch(
    "/{meeting_id}",
    response_model=MeetingOut,
    summary="Reschedule or edit a meeting",
)
def update_meeting(
    meeting_id: uuid.UUID,
    data: MeetingUpdateIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MeetingOut:
    meeting = session.get(Meeting, meeting_id)
    if meeting is None or _hidden_from(session, current_user, meeting):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found.")

    updates = data.model_dump(exclude_unset=True, exclude={"attendee_user_ids"})
    for field, value in updates.items():
        setattr(meeting, field, value)
    if data.attendee_user_ids is not None:
        meeting.attendee_user_ids = [str(uid) for uid in data.attendee_user_ids]

    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return _to_out(session, meeting)


@router.delete(
    "/{meeting_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel a meeting",
)
def delete_meeting(
    meeting_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    meeting = session.get(Meeting, meeting_id)
    if meeting is None or _hidden_from(session, current_user, meeting):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found.")

    session.delete(meeting)
    session.commit()
