"""Global rate limiter for external API providers.

Each provider has an independent token bucket so LinkedIn throttling does not
affect G2 or Google Search. Buckets are process-local (same pattern as
OmnichannelGateway) — sufficient for single-instance deployments; for
multi-instance, back with Redis in a future iteration.
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
        allowed = bucket.try_consume()
        if not allowed:
            logger.warning(
                "GlobalRateLimiter: %s rate limit reached (tokens=%d)",
                provider,
                bucket.tokens_remaining,
            )
        return allowed

    def status(self) -> dict[str, dict[str, int | float]]:
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
