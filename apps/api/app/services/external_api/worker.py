"""Async ingestion worker — non-blocking external enrichment pipeline.

Uses ``asyncio.Queue`` to decouple webhook HTTP responses from slow external API
calls. The webhook endpoint enqueues a task and returns ``202 Accepted`` immediately;
the worker processes tasks in the background while the CEO continues working.

Flow
----
::

    POST /api/v1/webhooks/receive
        → validate HMAC signature
        → worker.enqueue(IngestionTask)
        → return 202 Accepted (< 50ms)

    IngestionWorker (background asyncio task)
        → route by event_type
        → DarkFunnelService.ingest_signal (intent events)
        → SignalEngine.ingest (market signals)
        → ExternalAPIOrchestrator.enrich_lead_from_signal
        → StrategyGeneratorService.enrich (re-run with enriched context)
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from app.core.database import session_scope
from app.core.logging import get_logger
from app.models.dark_funnel import DarkSignalType
from app.services.dead_letter import register_retry_handler

logger = get_logger(__name__)

_DLQ_EVENT_NAME = "ingestion.task_processing_failed"


class IngestionTaskType(str, Enum):
    EXTERNAL_WEBHOOK = "external_webhook"
    SIGNAL_ENRICHMENT = "signal_enrichment"


@dataclass
class IngestionTask:
    """Unit of work for the background ingestion queue."""

    task_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_type: IngestionTaskType = IngestionTaskType.EXTERNAL_WEBHOOK
    provider: str = "unknown"
    payload: dict[str, Any] = field(default_factory=dict)
    signal_id: str | None = None
    opportunity_id: str | None = None
    # Tenant resolved from the webhook call (X-BEE-Org-Key header or
    # ?org_key= query param — see app.api.deps.get_organization_from_webhook_key).
    # None means untagged, same backward-compatible contract as every other
    # optional organization_id in the codebase.
    organization_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class IngestionWorker:
    """Background worker backed by asyncio.Queue."""

    def __init__(self, queue_size: int = 1000) -> None:
        self._queue: asyncio.Queue[IngestionTask | None] = asyncio.Queue(maxsize=queue_size)
        self._task: asyncio.Task[None] | None = None
        self._running = False
        self.processed_count = 0
        self.error_count = 0

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="bee-ingestion-worker")
        logger.info("IngestionWorker: started (asyncio.Queue)")

    async def stop(self) -> None:
        self._running = False
        await self._queue.put(None)  # poison pill
        if self._task:
            await self._task
        logger.info("IngestionWorker: stopped (processed=%d errors=%d)", self.processed_count, self.error_count)

    async def enqueue(self, task: IngestionTask) -> str:
        """Add a task to the queue. Returns task_id immediately."""
        await self._queue.put(task)
        logger.info(
            "IngestionWorker: enqueued task=%s type=%s provider=%s",
            task.task_id,
            task.task_type.value,
            task.provider,
        )
        return task.task_id

    @property
    def queue_depth(self) -> int:
        return self._queue.qsize()

    async def _run_loop(self) -> None:
        while self._running:
            task = await self._queue.get()
            if task is None:
                break
            try:
                await asyncio.to_thread(self._process_sync, task)
                self.processed_count += 1
            except Exception as exc:  # noqa: BLE001
                self.error_count += 1
                logger.exception("IngestionWorker: task %s failed", task.task_id)
                # Without this, a transient failure here (a DB deadlock mid-
                # commit, a provider timeout inside enrichment) vanished with
                # only this log line as evidence — the webhook's effects
                # (dark funnel signal, market signal, enrichment) were lost
                # for good. Enqueuing to the DLQ makes it retryable with
                # backoff and, after exhausting retries, escalates to the CEO
                # — same resilience contract the WorkflowOrchestrator gets.
                await asyncio.to_thread(self._send_to_dlq, task, str(exc))
            finally:
                self._queue.task_done()

    def _send_to_dlq(self, task: IngestionTask, error: str) -> None:
        try:
            from app.models.dead_letter import DLQEventType
            from app.services.dead_letter import DeadLetterQueueService

            with session_scope() as session:
                DeadLetterQueueService(session).enqueue(
                    event_name=_DLQ_EVENT_NAME,
                    original_event=_task_to_dict(task),
                    error=error,
                    event_type=DLQEventType.WEBHOOK,
                )
        except Exception:  # noqa: BLE001
            # Same reasoning as WorkflowOrchestrator._enqueue_to_dlq: if the
            # DLQ write itself fails, log it — there's no further fallback,
            # but this must never raise out of the worker loop.
            logger.exception("IngestionWorker: failed to enqueue task %s to DLQ", task.task_id)

    def _process_sync(self, task: IngestionTask) -> None:
        """Synchronous processing — runs in thread pool to avoid blocking event loop."""
        if task.task_type == IngestionTaskType.EXTERNAL_WEBHOOK:
            self._process_external_webhook(task)
        elif task.task_type == IngestionTaskType.SIGNAL_ENRICHMENT:
            self._process_signal_enrichment(task)

    def _process_external_webhook(self, task: IngestionTask) -> None:
        """Route external webhook to DarkFunnel + SignalEngine + enrichment."""
        payload = task.payload
        provider = task.provider
        event_type = payload.get("event_type") or payload.get("event") or "unknown"
        organization_id = uuid.UUID(task.organization_id) if task.organization_id else None

        with session_scope() as session:
            # 1. Dark funnel intent signals (G2, website visits, LinkedIn research)
            if _is_dark_funnel_event(event_type, provider):
                self._ingest_dark_funnel(session, payload, provider, organization_id)

            # 2. Market signal ingestion (funding, hiring, etc.)
            signal_outcome = None
            if _is_market_signal_event(event_type, payload):
                signal_outcome = self._ingest_market_signal(session, payload, organization_id)

            # 3. External API enrichment (LinkedIn profile, G2, Google)
            from app.services.external_api.orchestrator import ExternalAPIOrchestrator

            orchestrator = ExternalAPIOrchestrator(session)
            enrichment = orchestrator.enrich_lead_from_signal(payload)

            linkedin_data = enrichment.get("linkedin") or {}
            logger.info(
                "IngestionWorker: external enrichment task=%s providers=%s "
                "linkedin_success=%s lead_title=%s mock=%s",
                task.task_id,
                enrichment.get("providers_called"),
                linkedin_data.get("success"),
                linkedin_data.get("lead_title"),
                linkedin_data.get("mock"),
            )

            # 4. Persist enrichment on signal + re-enrich strategy when opportunity exists
            if signal_outcome:
                opp_id = (
                    signal_outcome.opportunity.id if signal_outcome.opportunity else None
                )
                self._apply_enrichment_and_reenrich(
                    session,
                    signal_outcome.signal.id,
                    opp_id,
                    enrichment,
                )
            elif task.signal_id:
                self._apply_enrichment_and_reenrich(
                    session,
                    uuid.UUID(task.signal_id),
                    uuid.UUID(task.opportunity_id) if task.opportunity_id else None,
                    enrichment,
                )

            session.commit()

        logger.info(
            "IngestionWorker: processed webhook provider=%s event=%s task=%s",
            provider,
            event_type,
            task.task_id,
        )

    def _process_signal_enrichment(self, task: IngestionTask) -> None:
        """Enrich an existing signal after initial ingestion (LinkedIn profile fetch)."""
        if not task.signal_id:
            return

        with session_scope() as session:
            from app.models.opportunity import Opportunity
            from app.models.signal import Signal
            from app.services.external_api.orchestrator import ExternalAPIOrchestrator

            signal = session.get(Signal, uuid.UUID(task.signal_id))
            if not signal:
                logger.warning("IngestionWorker: signal %s not found", task.signal_id)
                return

            raw = signal.raw_payload or {}
            orchestrator = ExternalAPIOrchestrator(session)
            enrichment = orchestrator.enrich_lead_from_signal(raw)
            raw["external_enrichment"] = enrichment
            raw["lead"] = enrichment.get("lead", raw.get("lead", {}))
            raw["company"] = enrichment.get("company", raw.get("company", {}))
            signal.raw_payload = raw
            session.add(signal)

            opp = None
            if task.opportunity_id:
                opp = session.get(Opportunity, uuid.UUID(task.opportunity_id))
            self._reenrich_opportunity(session, signal, opp)
            session.commit()

    def _ingest_dark_funnel(
        self, session, payload: dict, provider: str, organization_id: uuid.UUID | None = None
    ) -> None:
        from app.schemas.dark_funnel import DarkFunnelSignalIn
        from app.services.dark_funnel.service import DarkFunnelService

        company = payload.get("company") or {}
        domain = company.get("domain") or payload.get("company_domain")
        if not domain:
            # Email-engagement events (SendGrid/Resend) carry a recipient
            # address, not a company domain — the recipient's own email
            # domain is a reasonable stand-in *for a work email*, same
            # honest-heuristic spirit as HiringProvider's domain-to-slug
            # guess. _domain_from_email refuses to guess on a free/consumer
            # provider, where "the domain" tells you nothing about who the
            # company is.
            recipient = payload.get("data", {}).get("email") or payload.get("email")
            domain = _domain_from_email(recipient) if recipient else None
        if not domain:
            return

        data = payload.get("data") or payload
        signal_in = DarkFunnelSignalIn(
            company_domain=domain,
            company_name=company.get("name"),
            signal_type=_map_dark_funnel_type(payload.get("event_type") or payload.get("event", "")),
            source_platform=provider,
            content_url=data.get("content_url") or data.get("url"),
            intent_keywords=data.get("intent_keywords") or data.get("keywords") or [],
            raw_payload=payload,
            external_id=payload.get("external_id"),
        )
        DarkFunnelService(session).ingest_signal(signal_in, organization_id)

    def _ingest_market_signal(self, session, payload: dict, organization_id: uuid.UUID | None = None):
        from app.schemas.signal import CompanyRef, LeadRef, SignalWebhookIn
        from app.services.signal_engine import SignalEngine

        company = payload.get("company") or {}
        lead = payload.get("lead") or {}
        webhook = SignalWebhookIn(
            title=payload.get("title") or payload.get("event_type") or "External signal",
            event=payload.get("event") or payload.get("event_type") or "external.event",
            description=payload.get("description"),
            external_id=payload.get("external_id"),
            company=CompanyRef(**company) if company else None,
            lead=LeadRef(**lead) if lead else None,
            data=payload.get("data") or {},
        )
        return SignalEngine(session).ingest(webhook, commit=False, organization_id=organization_id)

    def _apply_enrichment_and_reenrich(
        self,
        session,
        signal_id: uuid.UUID,
        opportunity_id: uuid.UUID | None,
        enrichment: dict,
    ) -> None:
        from app.models.opportunity import Opportunity
        from app.models.signal import Signal

        signal = session.get(Signal, signal_id)
        if not signal:
            return

        raw = signal.raw_payload or {}
        raw["external_enrichment"] = enrichment
        raw["lead"] = enrichment.get("lead", raw.get("lead", {}))
        raw["company"] = enrichment.get("company", raw.get("company", {}))
        signal.raw_payload = raw
        session.add(signal)
        session.flush()

        if opportunity_id:
            opp = session.get(Opportunity, opportunity_id)
            enriched = self._reenrich_opportunity(session, signal, opp)
            if enriched:
                logger.info(
                    "IngestionWorker: EnrichmentContext applied signal=%s "
                    "lead_title=%s external_keywords=%d strategy_channel=%s",
                    signal_id,
                    enriched.get("lead_title"),
                    len(enriched.get("external_intent_keywords") or []),
                    enriched.get("strategy_channel"),
                )
        else:
            logger.info(
                "IngestionWorker: enrichment persisted on signal=%s lead_title=%s providers=%s",
                signal_id,
                enrichment.get("lead", {}).get("title") or (enrichment.get("linkedin") or {}).get("lead_title"),
                enrichment.get("providers_called"),
            )

    def _reenrich_opportunity(self, session, signal, opportunity) -> dict | None:
        if not opportunity:
            return None
        from app.services.strategy_generator.service import StrategyGeneratorService

        svc = StrategyGeneratorService(session)
        svc.enrich(signal, opportunity)

        # Build EnrichmentContext snapshot for observability (not persisted separately)
        ctx = svc._build_context(signal)  # noqa: SLF001
        return {
            "lead_title": ctx.lead_title,
            "lead_name": ctx.lead_name,
            "external_profile": ctx.external_profile,
            "external_intent_keywords": ctx.external_intent_keywords,
            "external_providers_called": ctx.external_providers_called,
            "strategy_channel": (opportunity.strategy or {}).get("channel"),
        }


def _task_to_dict(task: IngestionTask) -> dict[str, Any]:
    """Serialize an :class:`IngestionTask` for DLQ storage/replay."""
    return {
        "task_id": task.task_id,
        "task_type": task.task_type.value,
        "provider": task.provider,
        "payload": task.payload,
        "signal_id": task.signal_id,
        "opportunity_id": task.opportunity_id,
        "organization_id": task.organization_id,
    }


def _task_from_dict(data: dict[str, Any]) -> IngestionTask:
    return IngestionTask(
        task_id=data.get("task_id") or str(uuid.uuid4()),
        task_type=IngestionTaskType(data.get("task_type", IngestionTaskType.EXTERNAL_WEBHOOK.value)),
        provider=data.get("provider", "unknown"),
        payload=data.get("payload") or {},
        signal_id=data.get("signal_id"),
        opportunity_id=data.get("opportunity_id"),
        organization_id=data.get("organization_id"),
    )


def _retry_ingestion_task(original_event: dict[str, Any]) -> bool:
    """DLQ retry handler for ``_DLQ_EVENT_NAME`` — replays the ingestion task
    synchronously against a fresh session. Returns True on success; raises
    (caught by DeadLetterQueueService.retry) on failure so the DLQ's
    exponential-backoff/permanently-failed bookkeeping applies same as any
    other retried event.
    """
    task = _task_from_dict(original_event)
    # A throwaway worker instance: _process_sync only dispatches by
    # task_type and doesn't touch any queue/running state, so this is safe
    # to call directly outside the normal enqueue/_run_loop path.
    IngestionWorker()._process_sync(task)  # noqa: SLF001
    return True


register_retry_handler(_DLQ_EVENT_NAME)(_retry_ingestion_task)


_FREE_EMAIL_PROVIDERS = {
    "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com",
    "live.com", "icloud.com", "aol.com", "protonmail.com", "proton.me",
}


def _domain_from_email(email: str) -> str | None:
    """acme.com from jane@acme.com — an honest heuristic *for a work
    email*: it refuses on a free/consumer provider, where the domain says
    nothing about who the company is (see the docstring at the call site).
    """
    if "@" not in email:
        return None
    domain = email.rsplit("@", 1)[-1].strip().lower()
    if not domain or "." not in domain or domain in _FREE_EMAIL_PROVIDERS:
        return None
    return domain


def _is_dark_funnel_event(event_type: str, provider: str) -> bool:
    dark_types = {
        "page_view", "content_download", "g2_review", "g2_comparison",
        "linkedin_research", "website_visit", "pricing_page_view",
        # Inbound email-engagement events from an outbound-delivery
        # provider's own event webhook (SendGrid/Resend) — see
        # _ingest_dark_funnel's domain-from-recipient-email fallback below.
        "email.opened", "email.clicked", "email.replied",
    }
    dark_providers = {"g2", "capterra", "google_search", "linkedin", "sendgrid", "resend"}
    return event_type in dark_types or provider in dark_providers


def _is_market_signal_event(event_type: str, payload: dict) -> bool:
    market_events = {
        "funding.round.announced", "hiring.spike", "leadership.change",
        "product.launch", "expansion.announced",
    }
    return event_type in market_events or bool(payload.get("title"))


def _map_dark_funnel_type(event_type: str) -> str:
    """Map a provider's raw event type to one of DarkSignalType's actual
    values (app.models.dark_funnel) — every entry here must be a real
    DarkSignalType member, or SIGNAL_WEIGHTS.get() silently falls through
    to its 5.0 default for every event this maps, regardless of how strong
    a signal it actually is. (The previous version of this table mapped to
    strings like "review_activity"/"comparison_research"/"website_visit" —
    none of which are DarkSignalType members; every dark-funnel event
    ingested through this path was silently scored at the same flat weight
    no matter its real type. Fixed here alongside adding the email events
    below, not spun off separately, since both touch this exact table.)
    """
    mapping = {
        "g2_review": DarkSignalType.REVIEW_VISIT,
        "g2_comparison": DarkSignalType.COMPETITOR_COMPARE,
        "linkedin_research": DarkSignalType.LINKEDIN_ENGAGEMENT,
        # A single generic page_view doesn't map to any specific
        # DarkSignalType (REPEAT_VISIT specifically means *multiple*
        # visits — using it here would inflate a first-time visit to the
        # same weight as a real repeat) — OTHER is the honest, lowest-weight
        # choice for an under-specified event, not a wrong-but-plausible one.
        "page_view": DarkSignalType.OTHER,
        "pricing_page_view": DarkSignalType.PRICING_VIEW,
        "content_download": DarkSignalType.CONTENT_READ,
        "email.opened": DarkSignalType.EMAIL_OPEN,
        "email.clicked": DarkSignalType.EMAIL_CLICK,
        "email.replied": DarkSignalType.EMAIL_REPLY,
    }
    return mapping.get(event_type, DarkSignalType.OTHER)


# Module singleton
_worker: IngestionWorker | None = None


def get_ingestion_worker() -> IngestionWorker:
    global _worker  # noqa: PLW0603
    if _worker is None:
        from app.core.config import get_settings

        _worker = IngestionWorker(queue_size=get_settings().EXTERNAL_WORKER_QUEUE_SIZE)
    return _worker


def reset_ingestion_worker() -> None:
    """Reset the worker singleton (scripts/tests)."""
    global _worker  # noqa: PLW0603
    _worker = None
