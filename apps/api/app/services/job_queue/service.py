"""JobQueueService — a generic, Redis-backed durable queue.

Why this exists instead of Celery/ARQ/RQ
------------------------------------------
Those all assume a persistent process that stays alive running
``worker.run()`` forever. BEE's API is deployed on Vercel serverless (see
DEPLOY_CHECKLIST.md's Postgres-connection-pooling gotcha) — there is no
such process. This follows the shape already proven in this codebase by
``MarketScanOrchestrator`` instead: durable state lives externally
(there: a ``next_scan_due_at`` column; here: this Redis sorted set), and a
bounded batch is drained inside one HTTP request triggered by a Vercel
Cron Job, respecting the same 60s ``maxDuration`` every other tick already
does. See ``app.api.v1.endpoints.internal_job_queue`` for that endpoint
and ``app.services.external_api.worker.run_job_queue_tick`` for the
ingestion-specific draining logic that uses this class.

This class itself is deliberately generic — envelope contents are opaque
``dict``s it never inspects — so a future second queue consumer isn't
stuck reimplementing the same sorted-set-as-delayed-queue primitive.

Reliability model
-------------------
A Redis **sorted set**, not a plain list: the score is a "ready-at" unix
timestamp, so :meth:`reschedule` can delay a retry by re-adding the same
envelope with a future score — no second structure needed for delayed
retry the way a plain FIFO list would require. :meth:`drain_batch` only
ever pops entries whose score has already passed (``ZRANGEBYSCORE ...
LIMIT``), and removes them from the set *before* the caller processes
them, so a slow or overlapping tick can never double-drain the same
envelope — a failed one comes back through :meth:`reschedule` (or the
caller's own dead-letter path once attempts are exhausted), it is never
left dangling half-popped.

Every method is None-safe: with no Redis configured (or Redis
unreachable), each one no-ops (``enqueue``/``reschedule`` return
``False``, ``drain_batch`` returns ``[]``, ``queue_depth`` returns ``0``)
rather than raising. Callers are expected to fall back to whatever
non-durable path they had before this queue existed — see
``IngestionWorker.enqueue``.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

_QUEUE_KEY = "bee:job_queue:envelopes"


class JobQueueService:
    def __init__(self) -> None:
        # Lazy import (not at module level) so a test that monkeypatches
        # app.core.redis.get_redis_client — the established pattern every
        # other Redis-backed piece in this codebase (SignupGuard,
        # ReplayGuard, GlobalRateLimiter) relies on — takes effect here too.
        # A module-level `from ... import get_redis_client` would bind the
        # name once at import time, before any test patch runs.
        from app.core.redis import get_redis_client

        self._client = get_redis_client()

    @property
    def available(self) -> bool:
        return self._client is not None

    def enqueue(self, payload: dict[str, Any], *, attempt: int = 0, delay_seconds: float = 0.0) -> bool:
        """Add ``payload`` to the queue, ready at ``now + delay_seconds``
        (0 = ready immediately). Returns False — never raises — if Redis
        is unavailable or the write fails."""
        if self._client is None:
            return False
        envelope = {"id": uuid.uuid4().hex, "attempt": attempt, "payload": payload}
        try:
            self._client.zadd(_QUEUE_KEY, {json.dumps(envelope): time.time() + delay_seconds})
            return True
        except Exception:  # noqa: BLE001
            logger.exception("JobQueueService.enqueue failed")
            return False

    def drain_batch(self, limit: int) -> list[dict[str, Any]]:
        """Pop up to ``limit`` ready envelopes (score <= now), removing
        them from the queue first. Each returned dict has ``id``,
        ``attempt`` (attempts already made, 0-indexed), and ``payload``
        (whatever was passed to :meth:`enqueue`). Returns ``[]` on any
        failure, including "Redis not configured" — a caller's tick just
        no-ops that round rather than raising out of a cron invocation."""
        if self._client is None:
            return []
        try:
            now = time.time()
            # redis-py's stubs type every call as sync-or-async depending on
            # which Redis class is instantiated; get_redis_client() always
            # returns the sync one, so the Awaitable branch mypy sees here
            # never actually applies — see app.core.redis. The explicit
            # annotation (not just a trailing ignore) is what keeps mypy
            # from re-flagging every downstream use of raw_entries too.
            raw_entries: list[str] = self._client.zrangebyscore(  # type: ignore[assignment]
                _QUEUE_KEY, 0, now, start=0, num=limit
            )
            if not raw_entries:
                return []
            self._client.zrem(_QUEUE_KEY, *raw_entries)
            return [json.loads(entry) for entry in raw_entries]
        except Exception:  # noqa: BLE001
            logger.exception("JobQueueService.drain_batch failed")
            return []

    def reschedule(self, envelope: dict[str, Any], *, delay_seconds: float) -> bool:
        """Re-add ``envelope`` (as returned by :meth:`drain_batch`) with
        its attempt count incremented, ready after ``delay_seconds``.
        Returns False if Redis is unavailable — the caller decides what
        "give up" means (this class has no concept of a max-attempts
        policy; see ``run_job_queue_tick`` for the ingestion queue's,
        shared with the Dead Letter Queue's own backoff schedule)."""
        if self._client is None:
            return False
        next_envelope = {**envelope, "attempt": envelope.get("attempt", 0) + 1}
        try:
            self._client.zadd(_QUEUE_KEY, {json.dumps(next_envelope): time.time() + delay_seconds})
            return True
        except Exception:  # noqa: BLE001
            logger.exception("JobQueueService.reschedule failed")
            return False

    def queue_depth(self) -> int:
        """Total envelopes waiting (ready or scheduled for later) — 0 when
        Redis is unavailable, same "no data, not an error" contract as
        every other method here."""
        if self._client is None:
            return 0
        try:
            return int(self._client.zcard(_QUEUE_KEY))  # type: ignore[arg-type]
        except Exception:  # noqa: BLE001
            logger.exception("JobQueueService.queue_depth failed")
            return 0


_service: JobQueueService | None = None


def get_job_queue_service() -> JobQueueService:
    """Module singleton — rebuilt only via :func:`reset_job_queue_service`
    (tests only), same shape as ``get_ingestion_worker``."""
    global _service  # noqa: PLW0603
    if _service is None:
        _service = JobQueueService()
    return _service


def reset_job_queue_service() -> None:
    """Reset the singleton (tests only)."""
    global _service  # noqa: PLW0603
    _service = None
