"""Abuse protection for ``POST /auth/register``.

Registration is open self-serve by design — there is no "join an existing
org" flow, no email verification, and no admin approval (see
``AuthService.register_organization``'s docstring). That is a reasonable
default for a product where every org is a paying customer's own account,
but during a controlled beta it means the only things standing between the
database and an unbounded pile of throwaway organizations are:

1. ``SIGNUP_INVITE_CODE`` (optional, see ``app.core.config``) — when set,
   ``/auth/register`` rejects any request that doesn't present the matching
   code, checked with a timing-safe comparison. Unset (the default) keeps
   today's fully-open behavior — this is additive, not a breaking change.
2. This module — a per-IP rate limit on registration attempts, independent
   of the invite code (a leaked code, or brute-forcing one, still hits this).

Per-process by default — same limitation as ``app.core.replay_guard`` and
``IngestionWorker`` — but upgrades to a Redis-backed sliding window (a
sorted set per key, scored by wall-clock time so it's comparable across
processes) whenever ``app.core.redis.get_redis_client()`` returns a client,
holding the quota across every instance instead of one. See that module's
docstring for the fallback behavior when Redis is unset or unreachable.
"""

from __future__ import annotations

import threading
import time
import uuid

from app.core.logging import get_logger

logger = get_logger(__name__)

_WINDOW_SECONDS = 3600


class SignupGuard:
    """Sliding-window per-key (IP) attempt counter.

    ``redis_namespace`` distinguishes independent quotas that happen to
    share this class (signup vs. password-reset vs. the /contact form) so
    they never collide in the shared Redis keyspace — each singleton below
    passes its own.
    """

    def __init__(self, max_per_hour: int, *, redis_namespace: str = "signup_guard") -> None:
        self._max = max_per_hour
        self._redis_namespace = redis_namespace
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def try_consume(self, key: str) -> bool:
        """Return True if ``key`` is still under its hourly quota (and record
        this attempt); False if it should be rejected. ``max_per_hour <= 0``
        disables the check entirely (every call passes) — used to turn this
        off in tests or a deployment that wants no rate limit at all."""
        if self._max <= 0:
            return True

        from app.core.redis import get_redis_client

        client = get_redis_client()
        if client is not None:
            try:
                return self._try_consume_redis(client, key)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Redis unavailable for signup_guard[%s] — falling back to process-local state",
                    self._redis_namespace,
                    exc_info=True,
                )
        return self._try_consume_local(key)

    def _try_consume_redis(self, client, key: str) -> bool:  # noqa: ANN001
        """Sorted-set sliding window: members are unique per-call tokens,
        scored by wall-clock time so the window is meaningful across
        processes (unlike ``time.monotonic()``, which the local fallback
        below uses safely only because it never leaves one process)."""
        redis_key = f"bee:{self._redis_namespace}:{key}"
        now = time.time()
        cutoff = now - _WINDOW_SECONDS
        pipe = client.pipeline()
        pipe.zremrangebyscore(redis_key, 0, cutoff)
        pipe.zcard(redis_key)
        _, count = pipe.execute()
        if count >= self._max:
            client.expire(redis_key, _WINDOW_SECONDS)
            return False
        client.zadd(redis_key, {f"{now}:{uuid.uuid4().hex[:8]}": now})
        client.expire(redis_key, _WINDOW_SECONDS)
        return True

    def _try_consume_local(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - _WINDOW_SECONDS
        with self._lock:
            recent = [t for t in self._hits.get(key, []) if t >= cutoff]
            if len(recent) >= self._max:
                self._hits[key] = recent
                return False
            recent.append(now)
            self._hits[key] = recent
            return True

    def reset(self) -> None:
        """Clear all tracked attempts (tests only) — local state only; a
        test exercising the Redis path clears it via the fakeredis/real
        client directly (flushdb), not through this method."""
        with self._lock:
            self._hits.clear()


_guard: SignupGuard | None = None
_guard_max: int | None = None


def get_signup_guard() -> SignupGuard:
    """Module singleton, sized from the current setting — rebuilt if the
    configured limit changes, same pattern as ``app.core.replay_guard``."""
    global _guard, _guard_max  # noqa: PLW0603
    from app.core.config import settings

    max_per_hour = settings.SIGNUP_RATE_LIMIT_PER_HOUR
    if _guard is None or _guard_max != max_per_hour:
        _guard = SignupGuard(max_per_hour, redis_namespace="signup_guard")
        _guard_max = max_per_hour
    return _guard


def reset_signup_guard() -> None:
    """Reset the singleton (tests only)."""
    global _guard, _guard_max  # noqa: PLW0603
    _guard = None
    _guard_max = None
