"""External webhook ingestion endpoints.

``POST /api/v1/webhooks/receive`` is the secure entry point for external systems
(LinkedIn Sales Nav, G2, Capterra, Google) to push intent and market signals
into BEE.

Security
--------
1. Provider-specific HMAC signature (``X-BEE-Signature`` or ``X-Provider-Signature``)
2. Exempt from API key auth — external providers authenticate via HMAC only
3. Replay protection — the same signature can't be accepted twice within
   ``WEBHOOK_REPLAY_WINDOW_SECONDS`` (see ``app.core.replay_guard``)
4. Optional tenant identity — ``X-BEE-Org-Key`` header or ``?org_key=``
   query param (see ``app.api.deps.get_organization_from_webhook_key``);
   absent means untagged, same backward-compatible contract as everywhere
   else organization_id is optional
5. Returns ``202 Accepted`` immediately — never blocks on external API calls

Flow
----
::

    External system POST /webhooks/receive
        → verify_provider_webhook_signature()
        → replay guard (reject an exact repeat signature)
        → IngestionWorker.enqueue()
        → 202 Accepted (< 50ms)

    Background worker (asyncio.Queue)
        → DarkFunnelService (intent signals)
        → SignalEngine (market signals)
        → ExternalAPIOrchestrator.enrich_lead_from_signal()
        → StrategyGeneratorService.enrich() → EnrichmentContext updated
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlmodel import Session

from app.api.deps import get_organization_from_webhook_key
from app.core.config import get_settings
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.replay_guard import get_replay_guard
from app.core.security import verify_provider_webhook_signature
from app.schemas.external_webhook import (
    ExternalWebhookAccepted,
    ExternalWebhookIn,
    IngestionWorkerStatus,
)
from app.services.external_api.orchestrator import ExternalAPIOrchestrator
from app.services.external_api.worker import IngestionTask, IngestionTaskType, get_ingestion_worker
from app.services.secret_manager import get_secret_manager

logger = get_logger(__name__)
router = APIRouter(prefix="/webhooks", tags=["External Ingestion"])


def _resolve_signature(
    x_bee_signature: str | None,
    x_provider_signature: str | None,
) -> str | None:
    return x_bee_signature or x_provider_signature


@router.post(
    "/receive",
    response_model=ExternalWebhookAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Receive external provider webhook (async processing)",
)
async def receive_external_webhook(
    request: Request,
    x_bee_signature: str | None = Header(default=None, alias="X-BEE-Signature"),
    x_provider_signature: str | None = Header(default=None, alias="X-Provider-Signature"),
    organization_id: uuid.UUID | None = Depends(get_organization_from_webhook_key),
) -> ExternalWebhookAccepted:
    """Accept an external webhook, validate signature, enqueue for async processing.

    The HTTP response returns in < 50ms. Profile enrichment, dark funnel scoring,
    and strategy re-generation happen in the background worker.
    """
    settings = get_settings()
    if not settings.EXTERNAL_INGESTION_ENABLED:
        raise HTTPException(status_code=503, detail="External ingestion is disabled.")

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty request body.")

    try:
        payload_dict = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.") from exc

    try:
        webhook = ExternalWebhookIn.model_validate(payload_dict)
    except ValueError as exc:  # pydantic ValidationError is a ValueError subclass
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    provider = webhook.provider

    signature = _resolve_signature(x_bee_signature, x_provider_signature)
    if not verify_provider_webhook_signature(raw_body, signature, provider):
        logger.warning("External webhook rejected — invalid signature. provider=%s", provider)
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or missing webhook signature for provider '{provider}'.",
        )

    # Replay protection — only meaningful once we know the signature is
    # genuinely valid (an attacker without the secret can't produce a
    # signature worth replaying in the first place). A signature-less
    # request (WEBHOOK_SIGNATURE_REQUIRED=False, local dev) has nothing
    # stable to key the guard on, so it's skipped rather than keyed on
    # None — every unsigned request would otherwise collide on the same key.
    if signature and not get_replay_guard().check_and_record(f"{provider}:{signature}"):
        logger.warning("External webhook rejected — replayed signature. provider=%s", provider)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This exact webhook delivery was already accepted — request rejected as a replay.",
        )

    # Normalise payload for worker
    task_payload = webhook.model_dump()
    if webhook.event and not task_payload.get("event_type"):
        task_payload["event_type"] = webhook.event

    worker = get_ingestion_worker()
    task = IngestionTask(
        task_type=IngestionTaskType.EXTERNAL_WEBHOOK,
        provider=provider,
        payload=task_payload,
        organization_id=str(organization_id) if organization_id else None,
    )
    task_id = await worker.enqueue(task)

    logger.info(
        "External webhook accepted: provider=%s event=%s task=%s org=%s",
        provider,
        task_payload.get("event_type"),
        task_id,
        organization_id,
    )

    return ExternalWebhookAccepted(
        task_id=task_id,
        provider=provider,
        message="Webhook accepted — enrichment and strategy update queued.",
    )


@router.get(
    "/status",
    response_model=IngestionWorkerStatus,
    summary="External ingestion worker and provider status",
)
def external_ingestion_status(
    session: Session = Depends(get_session),
) -> IngestionWorkerStatus:
    """Return worker queue depth, provider configuration, and rate limit status."""
    worker = get_ingestion_worker()
    orchestrator = ExternalAPIOrchestrator(session)
    secrets = get_secret_manager()

    return IngestionWorkerStatus(
        running=worker._running,  # noqa: SLF001
        queue_depth=worker.queue_depth,
        processed_count=worker.processed_count,
        error_count=worker.error_count,
        providers=[
            {**p, "webhook_configured": bool(secrets.get_webhook_secret(p["name"]))}  # type: ignore[arg-type]
            for p in orchestrator.list_providers()
        ],
        rate_limits=orchestrator.rate_limit_status(),
    )
