"""Pluggable registry for WorkflowHandlers."""

from __future__ import annotations

from app.core.logging import get_logger
from app.services.workflow_orchestrator.base import WorkflowHandler

logger = get_logger(__name__)

_REGISTRY: dict[str, WorkflowHandler] = {}


def register_workflow_handler(cls: type[WorkflowHandler]) -> type[WorkflowHandler]:
    """Class decorator that registers a workflow handler.

    Usage::

        @register_workflow_handler
        class OnOpportunityWon_CRM(WorkflowHandler):
            name = "crm_update"
            event_types = ["opportunity.won"]
            ...
    """
    instance = cls()
    if not instance.name or instance.name == "base":
        raise ValueError(f"WorkflowHandler {cls.__name__} must define a unique 'name'.")
    _REGISTRY[instance.name] = instance
    logger.debug("Registered workflow handler: %s (events=%s)", instance.name, instance.event_types)
    return cls


def get_handlers_for_event(event_type: str) -> list[WorkflowHandler]:
    """Return all enabled handlers subscribed to this event type."""
    return [h for h in _REGISTRY.values() if h.enabled and event_type in h.event_types]


def get_all_handlers() -> list[WorkflowHandler]:
    return list(_REGISTRY.values())


def clear_registry() -> None:
    _REGISTRY.clear()
