"""DeadLetterQueue service — resilient webhook retry with exponential backoff.

The DLQ is the resilience layer for all external actions in BEE. Any webhook
call or channel dispatch that fails is captured here rather than silently
discarded. Failures are retried with exponential backoff up to 5 times before
being escalated to the CEO as a ``PendingAction`` alert.

Retry schedule
--------------
::

    Attempt | Delay  | Total wait
    --------|--------|------------
        1   |    4s  |   4s
        2   |    8s  |  12s
        3   |   16s  |  28s
        4   |   32s  |  60s
        5   |   64s  | 124s (~2min)
        6+  | permanently_failed → CEO alert

Integration points
------------------
The DLQ integrates with the ``WorkflowOrchestrator`` as a fallback:

.. code-block:: python

    try:
        webhook_emitter.emit_event(payload, url=handler.webhook_url)
    except Exception as exc:
        dlq = DeadLetterQueueService(session)
        dlq.enqueue(event_name="opportunity.won", event_type=DLQEventType.WEBHOOK,
                    original_event=payload, error=str(exc))

And with ``OmnichannelGateway`` for channel dispatch failures:

.. code-block:: python

    result = provider.send(channel_payload)
    if not result.success:
        dlq.enqueue(event_name="send_email", event_type=DLQEventType.EMAIL_SEND, ...)

Retry execution
---------------
In a production deployment, a Celery/ARQ worker calls ``retry_due_events()``
every 10 seconds. For MVP, retry is triggered on-demand via:

* ``POST /api/v1/workflow/dlq/{id}/retry`` — retry a specific event
* ``POST /api/v1/workflow/dlq/retry-due`` — retry all events due for retry

The retry callable is registered via ``DLQService.register_retry_handler(event_name, fn)``,
following the same pluggable pattern used throughout BEE.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.dead_letter import (
    _MAX_ATTEMPTS,
    DLQEventType,
    DLQStatus,
    FailedEvent,
    compute_next_retry_delay,
)
from app.schemas.dead_letter import DLQRetryResult, DLQSummary
from app.services.permissions import scope_by_organization_id as _scope

logger = get_logger(__name__)

# Registry: event_name → callable that replays the event
# Handlers are registered at startup or via register_retry_handler().
_RETRY_HANDLERS: dict[str, Callable[[dict[str, Any]], bool]] = {}


def register_retry_handler(event_name: str) -> Callable:
    """Decorator to register a retry handler for a DLQ event type.

    Usage::

        @register_retry_handler("opportunity.won")
        def retry_opportunity_won(payload: dict) -> bool:
            # Return True on success, raise on failure
            webhook_emitter.emit_event(payload, url=payload["webhook_url"])
            return True
    """
    def decorator(fn: Callable[[dict[str, Any]], bool]) -> Callable:
        _RETRY_HANDLERS[event_name] = fn
        logger.debug("DLQ retry handler registered: event=%s fn=%s", event_name, fn.__name__)
        return fn
    return decorator


class DeadLetterQueueService:
    """Manages the Dead Letter Queue for failed external actions.

    Provides:
    * ``enqueue()`` — capture a failure
    * ``retry()`` — manually retry a specific event
    * ``retry_due_events()`` — retry all events past their next_retry_at
    * ``resolve()`` — manually mark as resolved
    * ``query()`` — list events by status/type
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Event ingestion ───────────────────────────────────────────────────────

    def enqueue(
        self,
        event_name: str,
        original_event: dict[str, Any],
        error: str,
        event_type: str = DLQEventType.WEBHOOK,
        opportunity_id: uuid.UUID | None = None,
        lead_id: uuid.UUID | None = None,
        pending_action_id: uuid.UUID | None = None,
        workflow_task_id: uuid.UUID | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> FailedEvent:
        """Capture a failed event in the DLQ for later retry.

        Args:
            event_name:        Name of the event (e.g. 'opportunity.won', 'send_email')
            original_event:    The full event payload for replay.
            error:             Error message from the failure.
            event_type:        Category (DLQEventType).
            opportunity_id:    Associated opportunity UUID.
            lead_id:           Associated lead UUID.
            pending_action_id: Associated PendingAction UUID.
            workflow_task_id:  Associated WorkflowTask UUID.
            organization_id:   Tenant this failure belongs to. Most internal
                callers (WorkflowOrchestrator, OmnichannelGateway) don't yet
                have tenant context threaded through to their failure paths,
                so this stays optional and most enqueued events remain
                untagged (globally visible to DLQ operators) for now.

        Returns:
            The persisted ``FailedEvent`` record.
        """
        delay = compute_next_retry_delay(0)
        next_retry = datetime.now(UTC) + timedelta(seconds=delay)

        event = FailedEvent(
            organization_id=organization_id,
            event_type=event_type,
            event_name=event_name,
            opportunity_id=opportunity_id,
            lead_id=lead_id,
            pending_action_id=pending_action_id,
            workflow_task_id=workflow_task_id,
            original_event=original_event,
            attempt_count=1,
            last_error=error,
            error_history=[{
                "attempt": 1,
                "error": error,
                "timestamp": datetime.now(UTC).isoformat(),
            }],
            status=DLQStatus.PENDING,
            next_retry_at=next_retry,
            last_attempted_at=datetime.now(UTC),
        )
        self.session.add(event)
        self.session.flush()
        self.session.refresh(event)

        logger.warning(
            "DLQ: event enqueued — name=%s type=%s next_retry=%s id=%s",
            event_name, event_type, next_retry.isoformat(), event.id,
        )
        return event

    # ── Retry logic ───────────────────────────────────────────────────────────

    def retry(self, event_id: uuid.UUID) -> DLQRetryResult:
        """Manually trigger a retry for a specific DLQ event.

        Uses the registered retry handler for the event's name. If no handler
        is registered, the event is retried as a no-op (for testability).

        Returns:
            A ``DLQRetryResult`` with success status and new event state.
        """
        event = self.session.get(FailedEvent, event_id)
        if not event:
            return DLQRetryResult(
                event_id=event_id, success=False, status="not_found",
                message="Event not found in DLQ", attempt_count=0,
            )

        if event.status == DLQStatus.RESOLVED:
            return DLQRetryResult(
                event_id=event_id, success=True, status=DLQStatus.RESOLVED,
                message="Event already resolved", attempt_count=event.attempt_count,
            )

        if event.max_attempts_reached and event.status == DLQStatus.PERMANENTLY_FAILED:
            return DLQRetryResult(
                event_id=event_id, success=False, status=DLQStatus.PERMANENTLY_FAILED,
                message=f"Max retry attempts ({_MAX_ATTEMPTS}) reached. CEO was alerted.",
                attempt_count=event.attempt_count,
            )

        event.status = DLQStatus.RETRYING
        event.last_attempted_at = datetime.now(UTC)
        self.session.add(event)
        self.session.flush()

        # Execute retry
        success = False
        error_msg: str | None = None
        try:
            handler = _RETRY_HANDLERS.get(event.event_name)
            if handler:
                success = handler(event.original_event)
            else:
                # No handler registered — treat as retriable (will be resolved externally)
                logger.warning("DLQ: no retry handler for event_name=%s — marking retriable", event.event_name)
                success = False
                error_msg = f"No retry handler registered for '{event.event_name}'"
        except Exception as exc:  # noqa: BLE001
            success = False
            error_msg = str(exc)
            logger.exception("DLQ: retry failed for event %s", event_id)

        return self._record_retry_outcome(event, success, error_msg)

    def retry_due_events(self, limit: int = 50) -> list[DLQRetryResult]:
        """Retry all events whose ``next_retry_at`` is in the past.

        This is the method called by the background retry worker.
        """
        now = datetime.now(UTC)
        due = list(
            self.session.exec(
                select(FailedEvent)
                .where(FailedEvent.status.in_([DLQStatus.PENDING, DLQStatus.RETRYING]))
                .where(FailedEvent.next_retry_at <= now)
                .limit(limit)
            ).all()
        )

        results = []
        for event in due:
            result = self.retry(event.id)
            results.append(result)

        logger.info("DLQ: retried %d due events", len(results))
        return results

    def resolve(
        self, event_id: uuid.UUID, notes: str | None = None, organization_id: uuid.UUID | None = None
    ) -> FailedEvent | None:
        """Manually mark an event as resolved (e.g. fixed externally)."""
        event = self.session.get(FailedEvent, event_id)
        if not event or (
            organization_id is not None
            and event.organization_id is not None
            and event.organization_id != organization_id
        ):
            return None
        event.status = DLQStatus.RESOLVED
        event.resolved_at = datetime.now(UTC)
        event.resolution_notes = notes or "Manually resolved"
        self.session.add(event)
        self.session.flush()
        logger.info("DLQ: event %s manually resolved", event_id)
        return event

    # ── Queries ───────────────────────────────────────────────────────────────

    def get_event(self, event_id: uuid.UUID, organization_id: uuid.UUID | None = None) -> FailedEvent | None:
        event = self.session.get(FailedEvent, event_id)
        if not event or (
            organization_id is not None
            and event.organization_id is not None
            and event.organization_id != organization_id
        ):
            return None
        return event

    def list_events(
        self,
        status: str | None = None,
        event_type: str | None = None,
        limit: int = 50,
        organization_id: uuid.UUID | None = None,
    ) -> list[FailedEvent]:
        stmt = select(FailedEvent).order_by(FailedEvent.created_at.desc()).limit(limit)
        if status:
            stmt = stmt.where(FailedEvent.status == status)
        if event_type:
            stmt = stmt.where(FailedEvent.event_type == event_type)
        stmt = _scope(stmt, FailedEvent.organization_id, organization_id)
        return list(self.session.exec(stmt).all())

    def get_summary(self, organization_id: uuid.UUID | None = None) -> DLQSummary:
        stmt = _scope(select(FailedEvent), FailedEvent.organization_id, organization_id)
        all_events = list(self.session.exec(stmt).all())
        now = datetime.now(UTC)

        pending = [e for e in all_events if e.status == DLQStatus.PENDING]
        retrying = [e for e in all_events if e.status == DLQStatus.RETRYING]
        resolved = [e for e in all_events if e.status == DLQStatus.RESOLVED]
        failed = [e for e in all_events if e.status == DLQStatus.PERMANENTLY_FAILED]
        due_now = [
            e for e in pending + retrying
            if e.next_retry_at and e.next_retry_at.replace(tzinfo=UTC) <= now
        ]

        return DLQSummary(
            total_events=len(all_events),
            pending_count=len(pending),
            retrying_count=len(retrying),
            resolved_count=len(resolved),
            permanently_failed_count=len(failed),
            due_for_retry_count=len(due_now),
            ceo_alerted_count=sum(1 for e in all_events if e.ceo_alerted),
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _record_retry_outcome(
        self, event: FailedEvent, success: bool, error_msg: str | None
    ) -> DLQRetryResult:
        """Update the FailedEvent after a retry attempt and return a result."""
        now = datetime.now(UTC)

        if success:
            event.status = DLQStatus.RESOLVED
            event.resolved_at = now
            event.resolution_notes = "Auto-resolved by retry"
            self.session.add(event)
            self.session.flush()
            logger.info("DLQ: event %s resolved after %d attempt(s)", event.id, event.attempt_count)
            return DLQRetryResult(
                event_id=event.id, success=True, status=DLQStatus.RESOLVED,
                message="Successfully retried and resolved",
                attempt_count=event.attempt_count,
            )

        # Failure: schedule next retry or escalate
        error_entry = {
            "attempt": event.attempt_count + 1,
            "error": error_msg or "Unknown error",
            "timestamp": now.isoformat(),
        }
        event.attempt_count += 1
        event.last_error = error_msg
        event.error_history = list(event.error_history or []) + [error_entry]
        event.last_attempted_at = now

        if event.max_attempts_reached:
            event.status = DLQStatus.PERMANENTLY_FAILED
            event.next_retry_at = None
            self._alert_ceo(event)
            logger.error(
                "DLQ: event %s permanently failed after %d attempts — CEO alerted",
                event.id, event.attempt_count,
            )
        else:
            delay = compute_next_retry_delay(event.attempt_count)
            event.status = DLQStatus.PENDING
            event.next_retry_at = now + timedelta(seconds=delay)
            logger.warning(
                "DLQ: event %s retry %d failed — next attempt in %ds",
                event.id, event.attempt_count, delay,
            )

        self.session.add(event)
        self.session.flush()

        return DLQRetryResult(
            event_id=event.id,
            success=False,
            status=event.status,
            message=f"Retry failed (attempt {event.attempt_count}/{_MAX_ATTEMPTS}): {error_msg}",
            attempt_count=event.attempt_count,
            next_retry_at=event.next_retry_at,
        )

    def _alert_ceo(self, event: FailedEvent) -> None:
        """Create a PENDING_APPROVAL action to alert the CEO about a permanently failed event."""
        if event.ceo_alerted:
            return
        try:
            from app.models.base import ActionStatus, ActionType
            from app.models.pending_action import PendingAction

            alert = PendingAction(
                organization_id=event.organization_id,
                opportunity_id=event.opportunity_id,
                action_type=ActionType.WEBHOOK_CALL,
                status=ActionStatus.PENDING_APPROVAL,
                title=f"DLQ Alert: {event.event_name} permanently failed",
                description=(
                    f"Event '{event.event_name}' failed {event.attempt_count} times and cannot be retried automatically. "
                    f"Last error: {event.last_error or 'Unknown'}. "
                    f"Manual intervention required. DLQ Event ID: {event.id}"
                ),
                priority=1,
                metadata={"dlq_event_id": str(event.id), "event_name": event.event_name},
            )
            self.session.add(alert)
            event.ceo_alerted = True
            self.session.add(event)
            self.session.flush()
            logger.info("DLQ: CEO alert created for permanently failed event %s", event.id)
        except Exception:  # noqa: BLE001
            logger.exception("DLQ: failed to create CEO alert for event %s", event.id)
