"""Real-time notifications — publish side. See
app.api.v1.endpoints.notifications_stream for the read side (the SSE
endpoint a browser tab actually connects to).

Why this exists: BEE's whole value proposition is surfacing hot signals
fast, but until now the frontend only found out about anything new via
30-second polling while a tab happened to be open (see
src/hooks/use-notifications.ts on the frontend) — no push of any kind.
This gives select domain events a real-time path: publish to a per-org
Redis pub/sub channel here, an SSE connection subscribed to that same
channel delivers it to every open tab for that org within the same
second it happens.

Redis-only, no in-process fallback (unlike every rate-limit guard in
app.core, which falls back to process-local state) — pub/sub has no
meaningful single-process equivalent worth building: with no Redis
configured, publish_notification() is simply a no-op and the SSE
endpoint tells the frontend to keep polling instead (see that endpoint's
own docstring). A production deployment running more than one API
instance needs Redis for the rate-limit guards to hold a shared quota
anyway (see app.core.redis's own docstring) — this rides the same
requirement rather than adding a new one.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.core.logging import get_logger
from app.core.redis import get_redis_client

logger = get_logger(__name__)


def notification_channel(organization_id: uuid.UUID) -> str:
    return f"bee:notifications:{organization_id}"


def publish_notification(organization_id: uuid.UUID, *, event_type: str, payload: dict[str, Any]) -> None:
    """Best-effort, never raises — same "enrichment must never break the
    primary action" convention as every other side-channel publish in
    this codebase (StrategyGeneratorService.enrich's own call sites,
    app.services.events.dispatcher.publish). A missing/unreachable Redis
    means this notification just never reaches an open tab in real
    time — it does NOT fail whatever real action (an opportunity closing,
    a battlecard becoming ready) triggered it.
    """
    client = get_redis_client()
    if client is None:
        return
    try:
        client.publish(
            notification_channel(organization_id),
            json.dumps({"event_type": event_type, **payload}, default=str),
        )
    except Exception:  # noqa: BLE001
        logger.warning("publish_notification failed for org=%s event=%s", organization_id, event_type, exc_info=True)
