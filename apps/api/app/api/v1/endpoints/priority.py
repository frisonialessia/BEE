"""Bandeja de Decisiones — GET /api/v1/priority/today.

Fuses DarkFunnelService, CyclePredictorService, and AnomalyDetector into a
ranked "what to act on today" feed instead of a Kanban board an opportunity
waits passively in — see app.services.priority_feed for the ranking logic
and why each card's actions reuse existing endpoints rather than new
mutation logic here.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_session
from app.models.opportunity import Opportunity
from app.models.user import User
from app.schemas.priority import TodayFeedOut
from app.services.permissions import get_visible_user_ids
from app.services.priority_feed import build_today_feed

router = APIRouter(prefix="/priority", tags=["Priority Feed (Bandeja de Decisiones)"])

# How long a dismissed card stays hidden before it's eligible to resurface —
# a deliberate "come back to this later," not a permanent mute (there's no
# un-dismiss action; it just times out).
_DISMISS_DAYS = 7


@router.get(
    "/today",
    response_model=TodayFeedOut,
    summary="Today's ranked decisions — the 3-5 highest-leverage plays right now",
)
def get_today_feed(
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> TodayFeedOut:
    visible_user_ids = get_visible_user_ids(session, current_user) if current_user else None
    organization_id = current_user.organization_id if current_user else None
    return build_today_feed(
        session, organization_id=organization_id, visible_user_ids=visible_user_ids
    )


@router.post(
    "/today/{opportunity_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hide an opportunity from today's feed for a few days",
)
def dismiss_from_feed(
    opportunity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """"Descartar" — never deletes or edits the opportunity itself, just
    marks it not worth surfacing again until ``dismissed_until``. Stored on
    ``Opportunity.attributes`` (existing JSON scratch field) rather than a
    new column — this is UI state about the feed, not a fact about the
    opportunity.
    """
    opp = session.get(Opportunity, opportunity_id)
    if opp is None or (
        opp.organization_id is not None and opp.organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found")

    attributes = dict(opp.attributes or {})
    attributes["dismissed_until"] = (datetime.now(UTC) + timedelta(days=_DISMISS_DAYS)).isoformat()
    opp.attributes = attributes
    session.add(opp)
    session.commit()
