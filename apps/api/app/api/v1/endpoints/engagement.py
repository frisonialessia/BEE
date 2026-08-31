"""SmartEngagement API endpoints — incoming event processing and inbox."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.api.deps import get_organization_id, require_organization_id
from app.core.database import get_session
from app.models.engagement_event import IncomingEngagementEvent
from app.schemas.engagement import EngagementAnalysis, EngagementEventOut, IncomingEventIn
from app.services.omnichannel import OmnichannelGateway
from app.services.permissions import scope_by_organization_id
from app.services.personal_brand import PersonalBrandService
from app.services.smart_engagement import SmartEngagementEngine
from app.services.vector_store import get_vector_store

router = APIRouter(prefix="/engagement", tags=["Smart Engagement (Reactive AI)"])


def _get_engine(session: Session = Depends(get_session)) -> SmartEngagementEngine:
    brand_svc = PersonalBrandService(session, get_vector_store())
    gateway = OmnichannelGateway(session)
    return SmartEngagementEngine(session, brand_svc, gateway)


@router.post(
    "/events",
    response_model=EngagementAnalysis,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an incoming engagement event for analysis",
)
def submit_event(
    data: IncomingEventIn,
    engine: SmartEngagementEngine = Depends(_get_engine),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_id),
) -> EngagementAnalysis:
    """Submit an incoming engagement event (comment, DM, reply) for processing.

    The SmartEngagementEngine will:
    1. Classify the sentiment and intent
    2. Retrieve relevant brand context from the VectorKnowledgeBase
    3. Generate a response draft that sounds like the CEO
    4. Create a PendingAction for CEO approval (NO auto-send)

    The event is deduplicated by ``source_event_id`` if provided.
    """
    result = engine.process(data, organization_id)
    session.commit()
    return result


@router.get(
    "/events",
    response_model=list[EngagementEventOut],
    summary="List all processed engagement events (inbox)",
)
def list_events(
    source: str | None = Query(default=None, description="Filter by source: linkedin | twitter | email"),
    processed: bool | None = Query(default=None),
    ignored: bool | None = Query(default=False, description="Include spam/ignored events"),
    limit: int = Query(default=50, le=200),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[EngagementEventOut]:
    stmt = select(IncomingEngagementEvent).order_by(IncomingEngagementEvent.created_at.desc()).limit(limit)
    if source:
        stmt = stmt.where(IncomingEngagementEvent.source == source)
    if processed is not None:
        stmt = stmt.where(IncomingEngagementEvent.processed == processed)
    if not ignored:
        stmt = stmt.where(IncomingEngagementEvent.ignored == False)  # noqa: E712
    stmt = scope_by_organization_id(stmt, IncomingEngagementEvent.organization_id, organization_id)
    events = list(session.exec(stmt).all())
    return [EngagementEventOut.model_validate(e) for e in events]


@router.get(
    "/events/{event_id}",
    response_model=EngagementEventOut,
    summary="Get a specific engagement event",
)
def get_event(
    event_id: uuid.UUID,
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> EngagementEventOut:
    event = session.get(IncomingEngagementEvent, event_id)
    if not event or (
        organization_id is not None
        and event.organization_id is not None
        and event.organization_id != organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return EngagementEventOut.model_validate(event)
