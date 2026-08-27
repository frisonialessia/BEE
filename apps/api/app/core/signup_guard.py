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

Per-process only, same limitation as ``app.core.replay_guard`` and
``IngestionWorker`` — a multi-instance deployment needs a shared store
(Redis) for this to hold across instances.
"""

from __future__ import annotations

import threading
import time

_WINDOW_SECONDS = 3600


class SignupGuard:
    """Sliding-window per-key (IP) attempt counter."""

    def __init__(self, max_per_hour: int) -> None:
        self._max = max_per_hour
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def try_consume(self, key: str) -> bool:
        """Return True if ``key`` is still under its hourly quota (and record
        this attempt); False if it should be rejected. ``max_per_hour <= 0``
        disables the check entirely (every call passes) — used to turn this
        off in tests or a deployment that wants no rate limit at all."""
        if self._max <= 0:
            return True

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
        """Clear all tracked attempts (tests only)."""
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
        _guard = SignupGuard(max_per_hour)
        _guard_max = max_per_hour
    return _guard


def reset_signup_guard() -> None:
    """Reset the singleton (tests only)."""
    global _guard, _guard_max  # noqa: PLW0603
    _guard = None
    _guard_max = None
