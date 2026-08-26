"""WorkflowOrchestrator — BEE's event-driven integration bus.

The WorkflowOrchestrator is the central event bus. When a significant business
event occurs (opportunity WON, battlecard ready, lead validated), any service
publishes a ``BeeEvent`` to the orchestrator. The orchestrator dispatches it
to all registered handlers — synchronously by default, ready for async workers.

Integration model
-----------------
::

    [FeedbackLoopService: WON recorded]
         ↓
    [WorkflowOrchestrator.publish(BeeEvent("opportunity.won", ...))]
         ↓ routes to all subscribed handlers
    ┌────────────────────────────────────────────┐
    │ CRMUpdateHandler       → WorkflowTask      │
    │ ServiceDeliveryHandler → WorkflowTask      │
    │ BillingHandler         → WorkflowTask      │
    └────────────────────────────────────────────┘
         ↓ all tasks persisted to DB
    [CEO sees dispatched workflow tasks in /analytics/workflows]

Opt-in architecture
-------------------
* Handlers with no URL configured run in mock mode — no real call, just a DB record.
* The orchestrator itself never throws: handler failures are captured in the task record.
* New integrations = new handler class + decorator. Zero changes to existing code.

Async upgrade path
------------------
Replace ``session.flush()`` calls with a message queue (Redis/SQS) push for
true async execution. The handler interface doesn't change — only the dispatch
mechanism does.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

# Triggers handler registration as a side effect.
import app.services.workflow_orchestrator.handlers  # noqa: F401
from app.core.logging import get_logger
from app.models.workflow_task import WorkflowTask, WorkflowTaskStatus
from app.schemas.workflow import BeeEvent, WorkflowStatusOut
from app.services.permissions import scope_by_organization_id
from app.services.workflow_orchestrator.registry import get_all_handlers, get_handlers_for_event

logger = get_logger(__name__)


class WorkflowOrchestrator:
    """Publishes events and dispatches them to registered handlers."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def publish(self, event: BeeEvent) -> list[WorkflowTask]:
        """Publish an event and dispatch it to all subscribed handlers.

        Returns the list of WorkflowTask records created (one per handler).
        Never raises: all handler exceptions are captured in the task records.
        """
        if event.published_at is None:
            event.published_at = datetime.now(UTC)

        handlers = get_handlers_for_event(event.event_type)
        if not handlers:
            logger.debug("No handlers registered for event %s", event.event_type)
            return []

        tasks: list[WorkflowTask] = []
        for handler in handlers:
            try:
                task = handler.handle(event, self.session)
                tasks.append(task)
                logger.info(
                    "WorkflowTask created: handler=%s event=%s status=%s mock=%s",
                    handler.name,
                    event.event_type,
                    task.status,
                    task.mock,
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "Handler '%s' raised during event '%s' — creating FAILED task + DLQ entry.",
                    handler.name,
                    event.event_type,
                )
                # Ensure a failed task is always recorded for auditability.
                failed_task = WorkflowTask(
                    event_type=event.event_type,
                    entity_id=event.entity_id,
                    entity_type=event.entity_type,
                    handler_name=handler.name,
                    handler_version=handler.version,
                    status=WorkflowTaskStatus.FAILED,
                    payload=event.payload,
                    error_message=str(exc) or "Handler raised an unhandled exception.",
                    dispatched_at=datetime.now(UTC),
                )
                self.session.add(failed_task)
                self.session.flush()
                tasks.append(failed_task)

                # ── Dead Letter Queue: capture the failure for retry ─────────────
                self._enqueue_to_dlq(event, handler.name, str(exc), failed_task.id)

        return tasks

    # ── Dead Letter Queue integration ────────────────────────────────────────

    def _enqueue_to_dlq(
        self,
        event: BeeEvent,
        handler_name: str,
        error: str,
        workflow_task_id: uuid.UUID | None = None,
    ) -> None:
        """Capture a failed handler dispatch into the Dead Letter Queue."""
        try:
            from app.models.dead_letter import DLQEventType
            from app.services.dead_letter import DeadLetterQueueService

            dlq = DeadLetterQueueService(self.session)
            dlq.enqueue(
                event_name=event.event_type,
                event_type=DLQEventType.WORKFLOW_HANDLER,
                original_event={
                    "event_type": event.event_type,
                    "entity_id": str(event.entity_id) if event.entity_id else None,
                    "entity_type": event.entity_type,
                    "handler_name": handler_name,
                    "payload": event.payload,
                    "published_at": event.published_at.isoformat() if event.published_at else None,
                },
                error=error,
                workflow_task_id=workflow_task_id,
            )
            logger.info("DLQ: captured failed handler=%s event=%s", handler_name, event.event_type)
        except Exception:  # noqa: BLE001
            logger.exception("DLQ: failed to enqueue failure for handler=%s", handler_name)

    # ── Query interface ──────────────────────────────────────────────────────

    def get_tasks_for_entity(
        self, entity_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> list[WorkflowTask]:
        stmt = select(WorkflowTask).where(WorkflowTask.entity_id == entity_id)
        stmt = scope_by_organization_id(stmt, WorkflowTask.organization_id, organization_id)
        stmt = stmt.order_by(WorkflowTask.created_at.desc())
        return list(self.session.exec(stmt).all())

    def get_recent_tasks(
        self, limit: int = 50, organization_id: uuid.UUID | None = None
    ) -> list[WorkflowTask]:
        stmt = select(WorkflowTask)
        stmt = scope_by_organization_id(stmt, WorkflowTask.organization_id, organization_id)
        stmt = stmt.order_by(WorkflowTask.created_at.desc()).limit(limit)
        return list(self.session.exec(stmt).all())

    def get_status(self, organization_id: uuid.UUID | None = None) -> WorkflowStatusOut:
        stmt = scope_by_organization_id(select(WorkflowTask), WorkflowTask.organization_id, organization_id)
        tasks = self.session.exec(stmt).all()
        counts: dict[str, int] = {}
        for task in tasks:
            counts[task.status] = counts.get(task.status, 0) + 1
        return WorkflowStatusOut(
            total_tasks=len(tasks),
            dispatched=counts.get(WorkflowTaskStatus.DISPATCHED, 0),
            mock_dispatched=counts.get(WorkflowTaskStatus.MOCK_DISPATCHED, 0),
            completed=counts.get(WorkflowTaskStatus.COMPLETED, 0),
            failed=counts.get(WorkflowTaskStatus.FAILED, 0),
            skipped=counts.get(WorkflowTaskStatus.SKIPPED, 0),
            pending=counts.get(WorkflowTaskStatus.PENDING, 0),
        )

    def list_registered_handlers(self) -> list[dict]:
        """Return metadata about all registered handlers (for API introspection)."""
        return [
            {
                "name": h.name,
                "version": h.version,
                "event_types": h.event_types,
                "enabled": h.enabled,
            }
            for h in get_all_handlers()
        ]
