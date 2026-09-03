"""GET /notifications/stream — Server-Sent Events, the read side of
app.services.realtime. A dashboard tab opens one ``EventSource`` connection
per session; every ``publish_notification()`` call for that org (see
app.services.workflow_orchestrator.handlers.RealtimeNotificationHandler and
app.services.events.listeners' meeting.completed listener) arrives here
within the same second, instead of the frontend's own 30-second poll being
the only way anything new is ever noticed.

Auth: see app.api.deps.get_current_user_from_query_or_header — the browser's
EventSource API can't set an Authorization header, so this is the one
endpoint in the codebase that accepts a session token as a query parameter.

No Redis configured → the stream sends one ``unavailable`` event and ends
immediately, telling the frontend to fall back to polling rather than
holding a connection open that will never receive anything (see
_event_stream's own docstring).
"""

from __future__ import annotations

import contextlib
import time
from collections.abc import Generator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user_from_query_or_header
from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis_client
from app.models.user import User
from app.services.realtime import notification_channel

logger = get_logger(__name__)

router = APIRouter(prefix="/notifications", tags=["Real-time Notifications"])

# How often get_message() gives up and lets the loop send an SSE comment
# (":\n\n") as a keepalive — well under any reverse proxy's idle-connection
# timeout, and short enough that _MAX_STREAM_SECONDS is checked often.
_POLL_TIMEOUT_SECONDS = 15.0


def _event_stream(organization_id) -> Generator[str, None, None]:  # noqa: ANN001
    """Sync generator, run in FastAPI's threadpool since the route below is
    a plain ``def`` — redis-py's client here is sync (see app.core.redis),
    so this avoids needing a second, async-only Redis client just for this
    one endpoint.

    Bounded by NOTIFICATIONS_STREAM_MAX_SECONDS rather than running until
    the client disconnects — see that setting's own docstring. Ending the
    generator closes the HTTP response; ``EventSource`` reconnects
    automatically (that's the protocol's own designed behavior, not an
    error condition), and the reconnect immediately picks up whatever
    arrives next.
    """
    client = get_redis_client()
    if client is None:
        yield "event: unavailable\ndata: {}\n\n"
        return

    pubsub = client.pubsub()
    try:
        pubsub.subscribe(notification_channel(organization_id))
        yield ": connected\n\n"
        deadline = time.monotonic() + settings.NOTIFICATIONS_STREAM_MAX_SECONDS
        while time.monotonic() < deadline:
            try:
                message = pubsub.get_message(timeout=_POLL_TIMEOUT_SECONDS, ignore_subscribe_messages=True)
            except Exception:  # noqa: BLE001
                logger.warning("notifications_stream: pubsub read failed, ending stream", exc_info=True)
                return
            if message is None:
                yield ": keepalive\n\n"
                continue
            data = message.get("data")
            if data is not None:
                yield f"data: {data}\n\n"
    finally:
        with contextlib.suppress(Exception):
            pubsub.close()


@router.get(
    "/stream",
    summary="Server-Sent Events stream of this organization's real-time notifications",
    include_in_schema=False,  # not a normal JSON endpoint — SSE, documented in the module docstring instead
)
def stream_notifications(
    current_user: User = Depends(get_current_user_from_query_or_header),
) -> StreamingResponse:
    return StreamingResponse(
        _event_stream(current_user.organization_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Disables response buffering on nginx-fronted deployments —
            # without this an SSE stream can sit invisibly buffered instead
            # of flushing per-event.
            "X-Accel-Buffering": "no",
        },
    )
