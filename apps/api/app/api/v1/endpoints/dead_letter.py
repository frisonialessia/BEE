"""DeadLetterQueue API endpoints — DLQ visibility and retry management."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_organization_id
from app.core.database import get_session
from app.schemas.dead_letter import (
    DLQEnqueueRequest,
    DLQEventOut,
    DLQResolveRequest,
    DLQRetryResult,
    DLQSummary,
)
from app.services.dead_letter import DeadLetterQueueService

router = APIRouter(prefix="/workflow/dlq", tags=["Dead Letter Queue (Resilience)"])


def _get_dlq(session: Session = Depends(get_session)) -> DeadLetterQueueService:
    return DeadLetterQueueService(session)


@router.get(
    "",
    response_model=list[DLQEventOut],
    summary="List dead letter queue events",
)
def list_dlq_events(
    status_filter: str | None = Query(default=None, alias="status"),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    dlq: DeadLetterQueueService = Depends(_get_dlq),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[DLQEventOut]:
    """List events in the Dead Letter Queue.

    Filter by status:
    * ``pending`` — scheduled for retry
    * ``retrying`` — currently being retried
    * ``resolved`` — successfully retried
    * ``permanently_failed`` — max retries exhausted (CEO alerted)
    """
    events = dlq.list_events(
        status=status_filter, event_type=event_type, limit=limit, organization_id=organization_id
    )
    return [DLQEventOut.model_validate(e) for e in events]


@router.get(
    "/summary",
    response_model=DLQSummary,
    summary="DLQ health overview",
)
def get_dlq_summary(
    dlq: DeadLetterQueueService = Depends(_get_dlq),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> DLQSummary:
    """Return aggregate statistics about the Dead Letter Queue health."""
    return dlq.get_summary(organization_id)


@router.get(
    "/{event_id}",
    response_model=DLQEventOut,
    summary="Get a specific DLQ event",
)
def get_dlq_event(
    event_id: uuid.UUID,
    dlq: DeadLetterQueueService = Depends(_get_dlq),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> DLQEventOut:
    event = dlq.get_event(event_id, organization_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DLQ event not found")
    return DLQEventOut.model_validate(event)


@router.post(
    "/{event_id}/retry",
    response_model=DLQRetryResult,
    summary="Manually trigger a retry for a DLQ event",
)
def retry_event(
    event_id: uuid.UUID,
    dlq: DeadLetterQueueService = Depends(_get_dlq),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> DLQRetryResult:
    """Manually trigger a retry for a specific DLQ event.

    Uses the registered retry handler for the event's name. If no handler is
    registered, the event remains in pending state for external resolution.

    On success → status=resolved.
    On failure → attempt count incremented, next retry scheduled with exponential backoff.
    On max attempts exceeded → status=permanently_failed, CEO alerted via PendingAction.
    """
    # Ownership check before touching a handler — dlq.retry() itself stays
    # unscoped since retry_due_events() also calls it for every tenant's due
    # events in one background sweep.
    if dlq.get_event(event_id, organization_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DLQ event not found")
    result = dlq.retry(event_id)
    session.commit()
    return result


@router.post(
    "/retry-due",
    response_model=list[DLQRetryResult],
    summary="Retry all DLQ events due for retry",
)
def retry_due_events(
    limit: int = Query(default=50, le=200),
    dlq: DeadLetterQueueService = Depends(_get_dlq),
    session: Session = Depends(get_session),
) -> list[DLQRetryResult]:
    """Retry all events whose next_retry_at is in the past.

    In production this is called by a background worker every 10 seconds.
    Expose it as an endpoint for manual triggering and testing.
    """
    results = dlq.retry_due_events(limit=limit)
    session.commit()
    return results


@router.patch(
    "/{event_id}/resolve",
    response_model=DLQEventOut,
    summary="Manually resolve a DLQ event",
)
def resolve_event(
    event_id: uuid.UUID,
    body: DLQResolveRequest,
    dlq: DeadLetterQueueService = Depends(_get_dlq),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> DLQEventOut:
    """Mark a DLQ event as manually resolved.

    Use this when the external system was fixed and the event no longer needs
    automatic retry (e.g. a webhook was manually re-sent by the CEO).
    """
    event = dlq.resolve(event_id, notes=body.notes, organization_id=organization_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DLQ event not found")
    session.commit()
    return DLQEventOut.model_validate(event)


@router.post(
    "/test-enqueue",
    response_model=DLQEventOut,
    status_code=status.HTTP_201_CREATED,
    summary="Test: manually enqueue a DLQ event (dev/testing only)",
)
def test_enqueue(
    body: DLQEnqueueRequest,
    dlq: DeadLetterQueueService = Depends(_get_dlq),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> DLQEventOut:
    """Manually enqueue an event for testing DLQ retry logic.

    Do not use this in production flows — events should be enqueued automatically
    by the WorkflowOrchestrator and OmnichannelGateway on failure.
    """
    event = dlq.enqueue(
        event_name=body.event_name,
        event_type=body.event_type,
        original_event=body.original_event,
        error=body.error_message,
        opportunity_id=body.opportunity_id,
        lead_id=body.lead_id,
        organization_id=organization_id,
    )
    session.commit()
    return DLQEventOut.model_validate(event)
