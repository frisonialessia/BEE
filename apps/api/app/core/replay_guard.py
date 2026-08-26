"""Replay protection for signed inbound webhooks.

``app.core.security.verify_provider_webhook_signature`` proves a request was
signed by someone who knows the shared secret — it says nothing about
whether this is the *first* time that exact signed request has been seen.
An attacker who captures a valid signed request (network tap, a logging
proxy, a compromised intermediate) can resend the identical bytes
indefinitely and every replay passes signature verification, since nothing
about the signature changes on a byte-for-byte resend.

This module closes that gap with a simple seen-signature cache: the same
``(provider, signature)`` pair accepted twice within
``settings.WEBHOOK_REPLAY_WINDOW_SECONDS`` is rejected on the second and
every subsequent attempt. This is independent of (and complements, not
replaces) the application-level idempotency ``SignalEngine.ingest`` and
``DarkFunnelService.ingest_signal`` already provide via ``external_id`` —
that dedupes *business* re-ingestion (a legitimately retried delivery
carrying the same event), while this rejects the *transport-level* replay of
a captured request outright, before it's even parsed.

Per-process only, same limitation ``IngestionWorker`` itself already has
(see README §7 gotcha #2) — a multi-instance deployment needs a shared
store (Redis) for this to hold across instances. Acceptable for BEE's
current single-instance architecture; upgrading both together is future work.
"""

from __future__ import annotations

import threading
import time


class ReplayGuard:
    """Tracks recently-accepted ``(provider, signature)`` pairs.

    Lazily evicts entries older than ``window_seconds`` on every call rather
    than running a background sweep — cheap, and correct without needing a
    scheduler. A guard with ``window_seconds <= 0`` is a permanent no-op
    (every check passes), used to disable the feature entirely.
    """

    def __init__(self, window_seconds: int) -> None:
        self._window_seconds = window_seconds
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def check_and_record(self, key: str) -> bool:
        """Return True if ``key`` is new (and record it); False if it's a replay.

        Thread-safe: the ingestion worker's thread pool and the request
        handler thread can both call this concurrently.
        """
        if self._window_seconds <= 0:
            return True

        now = time.monotonic()
        cutoff = now - self._window_seconds
        with self._lock:
            # Evict stale entries opportunistically — bounds memory growth
            # without a background task, at the cost of a full dict scan per
            # call. Fine at BEE's current webhook volume; revisit if this
            # ever becomes a hot path (e.g. swap for an LRU + TTL structure).
            stale = [k for k, seen_at in self._seen.items() if seen_at < cutoff]
            for k in stale:
                del self._seen[k]

            if key in self._seen:
                return False
            self._seen[key] = now
            return True

    def reset(self) -> None:
        """Clear all tracked signatures (tests only)."""
        with self._lock:
            self._seen.clear()


_guard: ReplayGuard | None = None
_guard_window: int | None = None


def get_replay_guard() -> ReplayGuard:
    """Module singleton, sized from the current setting.

    Rebuilt if the configured window changes (e.g. between tests that patch
    ``settings.WEBHOOK_REPLAY_WINDOW_SECONDS``) so a stale window never
    lingers past a config change.
    """
    global _guard, _guard_window  # noqa: PLW0603
    from app.core.config import settings

    window = settings.WEBHOOK_REPLAY_WINDOW_SECONDS
    if _guard is None or _guard_window != window:
        _guard = ReplayGuard(window)
        _guard_window = window
    return _guard


def reset_replay_guard() -> None:
    """Reset the singleton (tests only)."""
    global _guard, _guard_window  # noqa: PLW0603
    _guard = None
    _guard_window = None
