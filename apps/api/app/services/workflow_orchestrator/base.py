"""WorkflowOrchestrator abstractions — the BEE event bus.

Every significant business event in BEE is published as a ``BeeEvent``. The
WorkflowOrchestrator dispatches it to all registered handlers. Each handler
represents one integration point: updating a CRM, creating a delivery ticket,
triggering billing, notifying Slack, etc.

Opt-in by handler
-----------------
Every handler is only active when its required configuration is present. A
handler without a webhook URL runs in "mock mode" — it creates a
``WorkflowTask`` record with ``mock=True`` and ``status=MOCK_DISPATCHED``
but makes no real external call. This lets the entire system run in tests
and demo environments without any integrations configured.

Handler contract
----------------
Handlers are stateless: they receive a ``BeeEvent`` and a ``Session`` and
return a ``WorkflowTask``. No side effects outside of the DB + optional HTTP.

Adding a new integration = one new class + ``@register_workflow_handler``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlmodel import Session

    from app.models.workflow_task import WorkflowTask
    from app.schemas.workflow import BeeEvent


class WorkflowHandler(ABC):
    """Base class for all workflow event handlers.

    Each handler subscribes to one or more event types and performs a specific
    integration action (webhook call, notification, CRM update, etc.).
    """

    #: Unique name for this handler. Used in WorkflowTask records.
    name: str = "base"

    #: Handler version. Increment when the payload schema changes.
    version: str = "1.0.0"

    #: Event types this handler reacts to.
    event_types: list[str] = []

    #: Whether this handler is active. Set to False to disable without removing.
    enabled: bool = True

    @abstractmethod
    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        """Process the event and return a WorkflowTask recording the outcome.

        MUST return a WorkflowTask (persisted to the DB by the handler itself).
        MUST NOT raise exceptions — catch and record failure in the task.
        MUST be idempotent where possible.
        """
        raise NotImplementedError

    def supports(self, event: BeeEvent) -> bool:
        """Return True if this handler should process the given event."""
        return self.enabled and event.event_type in self.event_types
