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
* ``OutboundWebhookHandler`` — fires on any event type in
  ``AVAILABLE_EVENT_TYPES``, fanning out to every org-configured
  ``OutboundWebhook`` that subscribed to it. Unlike the handlers above (one
  hardcoded, env-var-only URL each), this is the user-facing, multi-tenant
  equivalent: any org registers its own destination(s) from the dashboard —
  see app.api.v1.endpoints.outbound_webhooks.
* ``JiraSyncHandler`` — fires on ``opportunity.ready_to_action`` /
  ``opportunity.won`` / ``opportunity.lost``. Same multi-tenant shape as
  ``OutboundWebhookHandler`` (per-org credentials via ``IntegrationConnection``,
  not one shared env-var URL) but the other direction: BEE pushes a real
  Jira issue out, not just a webhook payload — see its own docstring below.
* ``RealtimeNotificationHandler`` — fires on ``opportunity.ready_to_action`` /
  ``opportunity.won`` / ``opportunity.lost``, publishes to the org's
  real-time channel (app.services.realtime) an open dashboard tab is
  subscribed to via SSE — see app.api.v1.endpoints.notifications_stream.
  Distinct from ``ReadyToActionNotifyHandler`` above: that one posts to an
  *external* Slack/Teams webhook, this one is BEE's own in-app "hey, look
  at this now" channel.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

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
class OutboundWebhookHandler(WorkflowHandler):
    """Fans an event out to every org-configured OutboundWebhook that wants it.

    Unlike every other handler in this module (one hardcoded, env-var-only
    URL), this is genuinely multi-tenant: it looks up ``OutboundWebhook``
    rows for the event's organization and POSTs to each active one whose
    ``event_types`` includes this event — no partner API credentials
    required on either side, since these all just need a plain HTTPS
    endpoint (Zapier, Make, a Slack incoming webhook, or the org's own
    system).

    Requires ``organization_id`` in the event payload (not on ``BeeEvent``
    itself — every publish call site already resolves it from the entity it
    fires on, e.g. the opportunity being closed) — without it there's no
    tenant to scope the lookup to, so this runs in mock mode.
    """

    name = "outbound_webhook"
    version = "1.0.0"
    # Kept in sync by hand with app.schemas.outbound_webhook.AVAILABLE_EVENT_TYPES
    # (importing it here would be fine too, but this list IS the contract the
    # registry decorator reads at import time, so it stays a literal here).
    event_types = ["opportunity.won", "opportunity.lost", "opportunity.ready_to_action"]

    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        from app.models.outbound_webhook import OutboundWebhook

        payload = {
            "event_type": event.event_type,
            "opportunity_id": str(event.entity_id) if event.entity_id else None,
            "timestamp": datetime.now(UTC).isoformat(),
            **event.payload,
        }

        org_id_raw = event.payload.get("organization_id")
        org_id = uuid.UUID(org_id_raw) if org_id_raw else None
        if org_id is None:
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "note": "No organization_id on this event — nothing to look up."},
                mock=True,
            )

        webhooks = session.exec(
            select(OutboundWebhook).where(
                OutboundWebhook.organization_id == org_id,
                OutboundWebhook.is_active == True,  # noqa: E712
            )
        ).all()
        matching = [w for w in webhooks if event.event_type in (w.event_types or [])]

        if not matching:
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "note": "No active outbound webhook subscribed to this event type."},
                mock=True,
            )

        deliveries = []
        any_ok = False
        for webhook in matching:
            ok, result = _post_webhook(webhook.url, payload, webhook.secret)
            any_ok = any_ok or ok
            webhook.last_triggered_at = datetime.now(UTC)
            webhook.last_status = "success" if ok else "failed"
            webhook.failure_count = 0 if ok else webhook.failure_count + 1
            session.add(webhook)
            deliveries.append({"webhook_id": str(webhook.id), "ok": ok, **result})
        session.flush()

        status = WorkflowTaskStatus.COMPLETED if any_ok else WorkflowTaskStatus.FAILED
        return _create_task(
            session, event, self.name, self.version, status, payload,
            result={"deliveries": deliveries},
            error_message=None if any_ok else "All subscribed webhooks failed to deliver.",
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


@register_workflow_handler
class JiraSyncHandler(WorkflowHandler):
    """Opportunity-stage sync into a per-org Jira project.

    Fires on ``opportunity.ready_to_action`` (creates an issue),
    ``opportunity.won`` / ``opportunity.lost`` (comments on the issue that
    was created for this opportunity, if any).

    Unlike CRMUpdateHandler/ServiceDeliveryHandler/BillingHandler (one
    hardcoded env-var URL each), Jira is connected per-organization via
    real OAuth — see ``app.services.integrations.jira_oauth`` and
    ``PATCH /integrations/jira/config`` for the target project key. Same
    multi-tenant lookup shape as ``OutboundWebhookHandler``, just against
    ``IntegrationConnection`` instead of ``OutboundWebhook``.

    Deliberately a comment, never a workflow transition, on won/lost — a
    project's transition IDs (e.g. which numeric id moves an issue to
    "Done") are configured per-project and per-workflow, nothing this
    handler could safely guess at without either silently failing or, worse,
    moving the issue to a status the team didn't intend. A comment always
    works, on any Jira project, regardless of its workflow configuration.

    Requires ``organization_id`` in the event payload, same reason
    ``OutboundWebhookHandler`` does — without it there's no tenant to look
    the Jira connection up for, so this runs in mock mode.
    """

    name = "jira_sync"
    version = "1.0.0"
    event_types = ["opportunity.ready_to_action", "opportunity.won", "opportunity.lost"]

    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        from app.models.opportunity import Opportunity
        from app.services.integrations.jira_sync import JiraApiClient, JiraApiError
        from app.services.integrations.service import IntegrationsService

        payload = {
            "event_type": event.event_type,
            "opportunity_id": str(event.entity_id) if event.entity_id else None,
            "timestamp": datetime.now(UTC).isoformat(),
            **event.payload,
        }

        def _mock(note: str) -> WorkflowTask:
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "note": note},
                mock=True,
            )

        org_id_raw = event.payload.get("organization_id")
        org_id = uuid.UUID(org_id_raw) if org_id_raw else None
        if org_id is None:
            return _mock("No organization_id on this event — nothing to look up.")

        integrations = IntegrationsService(session)
        access = integrations.get_valid_jira_access_token(org_id)
        if access is None:
            return _mock("Jira isn't connected for this organization.")
        access_token, cloud_id = access

        project_key = integrations.get_jira_project_key(org_id)
        if not project_key:
            return _mock("Jira is connected but no project key is configured (PATCH /integrations/jira/config).")

        opportunity = session.get(Opportunity, event.entity_id) if event.entity_id else None
        if opportunity is None:
            return _mock("Opportunity not found — nothing to sync.")

        client = JiraApiClient(access_token=access_token, cloud_id=cloud_id)
        company = event.payload.get("company_name") or "esta oportunidad"

        try:
            if event.event_type == "opportunity.ready_to_action":
                issue_key = client.create_issue(
                    project_key=project_key,
                    summary=f"BEE — Oportunidad lista para actuar: {company}",
                    description=(
                        f"BEE generó una battlecard completa para {company} "
                        f"(score {event.payload.get('score', 0):.0f}/100). "
                        f"Opportunity ID: {event.entity_id}."
                    ),
                )
                opportunity.attributes = {**opportunity.attributes, "jira_issue_key": issue_key}
                session.add(opportunity)
                session.flush()
                result: dict[str, Any] = {"issue_key": issue_key, "action": "created"}
            else:
                linked_issue_key: str | None = opportunity.attributes.get("jira_issue_key")
                if not linked_issue_key:
                    return _mock(
                        "No linked Jira issue for this opportunity (it never reached Ready to action) — nothing to comment on."
                    )
                outcome = "GANADA ✅" if event.event_type == "opportunity.won" else "PERDIDA ❌"
                note = f"Resultado en BEE: {outcome}."
                if event.payload.get("loss_reason"):
                    note += f" Motivo: {event.payload['loss_reason']}."
                client.add_comment(issue_key=linked_issue_key, text=note)
                result = {"issue_key": linked_issue_key, "action": "commented"}
        except JiraApiError as exc:
            return _create_task(
                session, event, self.name, self.version, WorkflowTaskStatus.FAILED, payload,
                result={"error": str(exc)},
                error_message=str(exc),
            )

        return _create_task(
            session, event, self.name, self.version, WorkflowTaskStatus.COMPLETED, payload, result=result
        )


@register_workflow_handler
class RealtimeNotificationHandler(WorkflowHandler):
    """Pushes a real-time, in-app notification to every open dashboard tab
    for this event's organization — see app.services.realtime and
    app.api.v1.endpoints.notifications_stream (the SSE endpoint a tab
    actually subscribes to).

    Fires on ``opportunity.ready_to_action`` / ``opportunity.won`` /
    ``opportunity.lost`` — the three moments the priority feed / dashboard
    most wants a rep to notice immediately rather than on the next
    30-second poll. "mock mode" here means Redis isn't configured
    (app.services.realtime.publish_notification no-ops in that case) — same
    every-handler convention as the rest of this file, just Redis instead
    of an env-var URL as the "is this actually wired up" gate.
    """

    name = "realtime_notification"
    version = "1.0.0"
    event_types = ["opportunity.ready_to_action", "opportunity.won", "opportunity.lost"]

    def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:
        from app.core.redis import get_redis_client
        from app.services.realtime import publish_notification

        payload = {
            "event_type": event.event_type,
            "opportunity_id": str(event.entity_id) if event.entity_id else None,
            "timestamp": datetime.now(UTC).isoformat(),
            **event.payload,
        }

        org_id_raw = event.payload.get("organization_id")
        org_id = uuid.UUID(org_id_raw) if org_id_raw else None
        if org_id is None:
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "note": "No organization_id on this event — nothing to notify."},
                mock=True,
            )

        if get_redis_client() is None:
            return _create_task(
                session, event, self.name, self.version,
                WorkflowTaskStatus.MOCK_DISPATCHED, payload,
                result={"mock": True, "note": "Redis isn't configured — real-time notifications are off."},
                mock=True,
            )

        publish_notification(
            org_id,
            event_type=event.event_type,
            payload={
                "opportunity_id": payload["opportunity_id"],
                "company_name": event.payload.get("company_name"),
                "score": event.payload.get("score"),
            },
        )
        return _create_task(
            session, event, self.name, self.version, WorkflowTaskStatus.COMPLETED, payload,
            result={"channel": "realtime"},
        )
