"""Shared Redis client.

This is the backing store every per-process guard/limiter in this codebase
already documents as "sufficient for a single instance, needs Redis for
multi-instance" — ``app.core.signup_guard``, ``app.core.password_reset_guard``,
``app.core.replay_guard``, ``app.services.external_api.rate_limiter``, and
the ``/contact`` per-IP limiter. Each of those upgrades to Redis when this
module can hand back a client, and falls back to its existing process-local
implementation otherwise — nothing in this module chooses that fallback
itself, it only decides whether a client is available.

Deliberately optional: :func:`get_redis_client` returns ``None`` whenever
``REDIS_URL`` is unset — same "ships off by default, zero behavior change"
convention as every other opt-in feature in this codebase (``MARKET_SCAN_ENABLED``,
``ACCOUNT_RESEARCH_ENABLED``, ``AutopilotConfig.enabled``...).

A misconfigured or unreachable Redis degrades the same way, not worse:
``redis.from_url`` connects lazily, so construction here never raises even
against a dead host — the first real command is what would fail, and every
caller in this codebase wraps that command in its own try/except and falls
back to local state for that one call. A Redis outage can therefore never
take a guard down; it just quietly reverts whichever instance can't reach
it to the single-instance behavior that instance already had before Redis
existed.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from app.core.logging import get_logger

if TYPE_CHECKING:
    from redis import Redis

logger = get_logger(__name__)


@lru_cache
def get_redis_client() -> Redis | None:
    """Return a shared Redis client, or ``None`` if Redis isn't configured
    (or the ``redis`` package isn't the client library reachable — this
    codebase's own dependency, so that only fails in a broken install).

    Cached (module-level singleton) — same pattern as ``get_signup_guard``/
    ``get_rate_limiter`` elsewhere in ``app.core``/``app.services``, so every
    caller in one process shares one connection pool rather than opening a
    new one per call.
    """
    from app.core.config import settings

    if not settings.REDIS_URL:
        return None

    try:
        import redis
    except ImportError:  # pragma: no cover - redis is a pinned dependency
        logger.error("REDIS_URL is set but the redis package is not installed")
        return None

    try:
        return redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Redis client construction failed — falling back to process-local state")
        return None


def reset_redis_client_cache() -> None:
    """Clear the cached client (tests only) — lets a test that patches
    ``settings.REDIS_URL`` (or swaps in a fakeredis instance via
    monkeypatching this module's cache) take effect immediately instead of
    reusing whatever client an earlier test already cached."""
    get_redis_client.cache_clear()
