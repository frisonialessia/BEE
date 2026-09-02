"""Abuse protection for ``POST /auth/forgot-password``.

A separate bucket from ``app.core.signup_guard``, not a shared one — a burst
of registration attempts and a burst of reset-email requests are different
abuse patterns and shouldn't share a quota (an attacker exhausting one
shouldn't incidentally block the other for the same IP). Same
:class:`~app.core.signup_guard.SignupGuard` sliding-window implementation
reused as-is rather than duplicated; only the singleton and its settings key
(``PASSWORD_RESET_RATE_LIMIT_PER_HOUR``) differ.

Per-process only, same limitation noted on the class itself — a
multi-instance deployment needs a shared store (Redis) for this to hold
across instances.
"""

from __future__ import annotations

from app.core.signup_guard import SignupGuard

_guard: SignupGuard | None = None
_guard_max: int | None = None


def get_password_reset_guard() -> SignupGuard:
    """Module singleton, sized from the current setting — rebuilt if the
    configured limit changes, same pattern as ``get_signup_guard``."""
    global _guard, _guard_max  # noqa: PLW0603
    from app.core.config import settings

    max_per_hour = settings.PASSWORD_RESET_RATE_LIMIT_PER_HOUR
    if _guard is None or _guard_max != max_per_hour:
        _guard = SignupGuard(max_per_hour)
        _guard_max = max_per_hour
    return _guard


def reset_password_reset_guard() -> None:
    """Reset the singleton (tests only)."""
    global _guard, _guard_max  # noqa: PLW0603
    _guard = None
    _guard_max = None
