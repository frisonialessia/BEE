"""Built-in workflow handlers for BEE's event bus.

These handlers react to domain events and dispatch to external systems.
Each handler is fully self-contained and opt-in:

* If the required URL is not configured → ``mock=True``, no real HTTP call.
* If the URL is configured → HMAC-signed POST with the full event payload.

Adding a new integration
-------------------------
1. Create a class inheriting from ``WorkflowHandler``
2. Decorate it with ``@register_workflow_handler``
3. Set ``event_types``, ``name``, and implement ``handle()``

That's it. The orchestrator picks it up automatically.

Built-in handlers
-----------------
* ``CRMUpdateHandler`` — fires on ``opportunity.won`` / ``opportunity.lost``
* ``ServiceDeliveryHandler`` — fires on ``opportunity.won`` (creates delivery ticket)
* ``BillingHandler`` — fires on ``opportunity.won`` (triggers invoice)
* ``ReadyToActionNotifyHandler`` — fires on ``opportunity.ready_to_action`` (Slack notify)
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime

from sqlmodel import Session

from app.core.logging import get_logger
from app.models.workflow_task import WorkflowTask, WorkflowTaskStatus
from app.schemas.workflow import BeeEvent
from app.services.workflow_orchestrator.base import WorkflowHandler
from app.services.workflow_orchestrator.registry import register_workflow_handler

logger = get_logger(__name__)

try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False


def _post_webhook(url: str, payload: dict, secret: str | None) -> tuple[bool, dict]:
    """Fire-and-forget HMAC-signed POST. Returns (success, result_dict)."""
    if not _HTTPX_AVAILABLE:
        return False, {"error": "httpx not installed"}
    body = json.dumps(payload, default=str).encode()
    headers = {"Content-Type": "application/json", "X-BEE-Event": payload.get("event_type", "unknown")}
    if secret:
        sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        headers["X-BEE-Signature"] = f"sha256={sig}"
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(url, content=body, headers=headers)
            resp.raise_for_status()
            return True, {"status_code": resp.status_code, "url": url}
    except Exception as exc:
        return False, {"error": str(exc), "url": url}


def _create_task(
    session: Session,
    event: BeeEvent,
    handler_name: str,
    handler_version: str,
    status: str,
    payload: dict,
    result: dict | None = None,
    mock: bool = False,
    error_message: str | None = None,
) -> WorkflowTask:
    task = WorkflowTask(
        event_type=event.event_type,
        entity_id=event.entity_id,
        entity_type=event.entity_type,
        handler_name=handler_name,
        handler_version=handler_version,
        status=status,
        mock=mock,
        payload=payload,
        result=result,
        dispatched_at=datetime.now(UTC) if status != WorkflowTaskStatus.PENDING else None,
        error_message=error_message,
    )
    session.add(task)
    session.flush()
    session.refresh(task)
    return task


@register_workflow_handler
class CRMUpdateHandler(WorkflowHandler):
    """Notifies the CRM of opportunity outcomes (WON or LOST).

    Fires on ``opportunity.won`` and ``opportunity.lost``.
    Configured via: ``WORKFLOW_CRM_URL`` env var.
    Mock-safe: no URL → mock dispatch with full payload for testing.
    """

    name = "crm_update"
    version = "1.0.0"
    event_types = ["opportunity.won", "opportunity.lost"]

    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        from app.core.config import get_settings
        settings = get_settings()
        url = getattr(settings, "WORKFLOW_CRM_URL", None)
        secret = getattr(settings, "WEBHOOK_SIGNING_SECRET", None)

        payload = {
            "event_type": event.event_type,
            "opportunity_id": str(event.entity_id) if event.entity_id else None,
            "outcome": "won" if "won" in event.event_type else "lost",
            "timestamp": datetime.now(UTC).isoformat(),
            **event.payload,
        }

        if not url:
            logger.debug("CRMUpdateHandler: no URL configured, mock dispatch.")
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "note": "Set WORKFLOW_CRM_URL to activate"},
                mock=True,
            )

        ok, result = _post_webhook(url, payload, secret)
        status = WorkflowTaskStatus.COMPLETED if ok else WorkflowTaskStatus.FAILED
        return _create_task(
            session, event, self.name, self.version, status, payload,
            result=result,
            error_message=result.get("error") if not ok else None,
        )


@register_workflow_handler
class ServiceDeliveryHandler(WorkflowHandler):
    """Triggers service delivery/fulfillment on opportunity WON.

    Fires on ``opportunity.won`` only.
    Configured via: ``WORKFLOW_DELIVERY_URL`` env var.
    Creates a delivery ticket in the external fulfillment system.
    """

    name = "service_delivery"
    version = "1.0.0"
    event_types = ["opportunity.won"]

    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        from app.core.config import get_settings
        settings = get_settings()
        url = getattr(settings, "WORKFLOW_DELIVERY_URL", None)
        secret = getattr(settings, "WEBHOOK_SIGNING_SECRET", None)

        payload = {
            "event_type": "service.delivery_requested",
            "opportunity_id": str(event.entity_id) if event.entity_id else None,
            "priority": event.payload.get("priority", "standard"),
            "company": event.payload.get("company_name"),
            "timestamp": datetime.now(UTC).isoformat(),
            **{k: v for k, v in event.payload.items() if k not in ("priority", "company_name")},
        }

        if not url:
            logger.debug("ServiceDeliveryHandler: no URL configured, mock dispatch.")
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "ticket_id": f"MOCK-{str(event.entity_id)[:8].upper()}", "note": "Set WORKFLOW_DELIVERY_URL to activate"},
                mock=True,
            )

        ok, result = _post_webhook(url, payload, secret)
        status = WorkflowTaskStatus.COMPLETED if ok else WorkflowTaskStatus.FAILED
        return _create_task(
            session, event, self.name, self.version, status, payload,
            result=result,
            error_message=result.get("error") if not ok else None,
        )


@register_workflow_handler
class BillingHandler(WorkflowHandler):
    """Triggers invoice creation on opportunity WON.

    Fires on ``opportunity.won`` only.
    Configured via: ``WORKFLOW_BILLING_URL`` env var.
    """

    name = "billing_trigger"
    version = "1.0.0"
    event_types = ["opportunity.won"]

    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        from app.core.config import get_settings
        settings = get_settings()
        url = getattr(settings, "WORKFLOW_BILLING_URL", None)
        secret = getattr(settings, "WEBHOOK_SIGNING_SECRET", None)

        payload = {
            "event_type": "billing.invoice_requested",
            "opportunity_id": str(event.entity_id) if event.entity_id else None,
            "timestamp": datetime.now(UTC).isoformat(),
            **event.payload,
        }

        if not url:
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "invoice_id": f"INV-MOCK-{str(event.entity_id)[:8].upper()}", "note": "Set WORKFLOW_BILLING_URL to activate"},
                mock=True,
            )

        ok, result = _post_webhook(url, payload, secret)
        status = WorkflowTaskStatus.COMPLETED if ok else WorkflowTaskStatus.FAILED
        return _create_task(
            session, event, self.name, self.version, status, payload,
            result=result,
            error_message=result.get("error") if not ok else None,
        )


@register_workflow_handler
class ReadyToActionNotifyHandler(WorkflowHandler):
    """Notifies the team when a new battlecard is ready.

    Fires on ``opportunity.ready_to_action``.
    Configured via: ``WORKFLOW_NOTIFY_URL`` env var (Slack/Teams webhook).
    """

    name = "ready_to_action_notify"
    version = "1.0.0"
    event_types = ["opportunity.ready_to_action"]

    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        from app.core.config import get_settings
        settings = get_settings()
        url = getattr(settings, "WORKFLOW_NOTIFY_URL", None)
        secret = getattr(settings, "WEBHOOK_SIGNING_SECRET", None)

        company = event.payload.get("company_name", "a company")
        score = event.payload.get("score", 0)
        payload = {
            "event_type": event.event_type,
            "text": f"🎯 New battlecard ready: *{company}* (score {score:.0f}/100)",
            "opportunity_id": str(event.entity_id) if event.entity_id else None,
            **event.payload,
        }

        if not url:
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "note": "Set WORKFLOW_NOTIFY_URL to activate"},
                mock=True,
            )

        ok, result = _post_webhook(url, payload, secret)
        status = WorkflowTaskStatus.COMPLETED if ok else WorkflowTaskStatus.FAILED
        return _create_task(
            session, event, self.name, self.version, status, payload,
            result=result,
            error_message=result.get("error") if not ok else None,
        )
