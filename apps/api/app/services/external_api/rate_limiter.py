"""Global rate limiter for external API providers.

Each provider has an independent token bucket so LinkedIn throttling does not
affect G2 or Google Search. Buckets are process-local by default (same
pattern as OmnichannelGateway) — sufficient for single-instance
deployments — but ``acquire()`` upgrades to a Redis-backed counter, shared
across every instance, whenever ``app.core.redis.get_redis_client()``
returns a client. See that module's docstring for the fallback behavior
when Redis is unset or unreachable.

The Redis path trades the local bucket's exact rolling-window semantics for
a simpler fixed-hour counter (INCR + EXPIRE) plus a separate min-interval
check — not perfectly equivalent, but the same "conservative, good enough
for abuse mitigation, not a hard SLA" tradeoff this limiter already made
locally. Two non-atomic round trips (read last-call, then INCR) mean a
tight race can occasionally let one extra call through under concurrent
load from multiple instances — acceptable for what this actually protects
(third-party provider quotas), not something worth a Lua script for yet.
"""

from __future__ import annotations

import time
from functools import lru_cache

from app.core.logging import get_logger
from app.services.external_api.interface import ProviderName, RateLimitConfig

logger = get_logger(__name__)

# Conservative defaults aligned with public API documentation
DEFAULT_LIMITS: dict[ProviderName, RateLimitConfig] = {
    "linkedin": RateLimitConfig(requests_per_hour=100, min_interval_seconds=5.0),
    "g2": RateLimitConfig(requests_per_hour=60, min_interval_seconds=2.0),
    "google_search": RateLimitConfig(requests_per_hour=100, min_interval_seconds=1.0),
    "capterra": RateLimitConfig(requests_per_hour=60, min_interval_seconds=2.0),
    # No official rate limit published for Greenhouse's public boards-api —
    # conservative by convention, same shape as every other provider here.
    "hiring": RateLimitConfig(requests_per_hour=100, min_interval_seconds=1.0),
    # A plain homepage GET, not a third-party API — generous but still
    # bounded so a burst of "create by domain" calls can't hammer arbitrary
    # sites back-to-back.
    "website": RateLimitConfig(requests_per_hour=200, min_interval_seconds=0.5),
}


class _TokenBucket:
    """Token-bucket rate limiter (mirrors OmnichannelGateway pattern)."""

    def __init__(self, config: RateLimitConfig) -> None:
        self._capacity = config.requests_per_hour
        self._tokens = config.requests_per_hour
        self._min_interval = config.min_interval_seconds
        self._last_call_ts: float = 0.0
        self._window_start: float = time.monotonic()

    def try_consume(self) -> bool:
        now = time.monotonic()
        if now - self._window_start >= 3600:
            self._tokens = self._capacity
            self._window_start = now
        if now - self._last_call_ts < self._min_interval:
            return False
        if self._tokens <= 0:
            return False
        self._tokens -= 1
        self._last_call_ts = now
        return True

    @property
    def tokens_remaining(self) -> int:
        return max(0, self._tokens)


class GlobalRateLimiter:
    """Singleton registry of per-provider token buckets."""

    def __init__(self) -> None:
        self._buckets: dict[ProviderName, _TokenBucket] = {
            name: _TokenBucket(cfg) for name, cfg in DEFAULT_LIMITS.items()
        }

    def acquire(self, provider: ProviderName) -> bool:
        """Try to consume one token for *provider*. Returns False if rate-limited."""
        bucket = self._buckets.get(provider)
        if bucket is None:
            return True

        from app.core.redis import get_redis_client

        client = get_redis_client()
        if client is not None:
            try:
                allowed = self._acquire_redis(client, provider, bucket)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Redis unavailable for rate_limiter[%s] — falling back to process-local bucket",
                    provider,
                    exc_info=True,
                )
                allowed = bucket.try_consume()
        else:
            allowed = bucket.try_consume()

        if not allowed:
            logger.warning("GlobalRateLimiter: %s rate limit reached", provider)
        return allowed

    def _acquire_redis(self, client, provider: ProviderName, bucket: _TokenBucket) -> bool:  # noqa: ANN001
        """Fixed-hour counter + min-interval check — see module docstring
        for why this isn't the exact same rolling-window algorithm as the
        local bucket."""
        now = time.time()
        last_call_key = f"bee:rate_limiter:{provider}:last_call"
        count_key = f"bee:rate_limiter:{provider}:count"

        last_call_raw = client.get(last_call_key)
        if last_call_raw is not None and now - float(last_call_raw) < bucket._min_interval:  # noqa: SLF001
            return False

        count = client.incr(count_key)
        if count == 1:
            client.expire(count_key, 3600)
        if count > bucket._capacity:  # noqa: SLF001
            return False

        client.set(last_call_key, now, ex=3600)
        return True

    def status(self) -> dict[str, dict[str, int | float]]:
        """Process-local bucket state — always reflects capacity, but
        ``tokens_remaining`` is only authoritative when ``acquire()`` is
        using the local fallback (no Redis configured, or Redis
        unreachable). When the Redis path is active, the real count lives
        in Redis instead (``bee:rate_limiter:{provider}:count``) — this
        keeps returning the last local value rather than reading it back
        out, so treat it as informational only in that case, not a live
        reading."""
        return {
            name: {
                "tokens_remaining": bucket.tokens_remaining,
                "capacity": bucket._capacity,  # noqa: SLF001
            }
            for name, bucket in self._buckets.items()
        }


@lru_cache
def get_rate_limiter() -> GlobalRateLimiter:
    return GlobalRateLimiter()
