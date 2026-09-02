"""Abuse protection for ``POST /auth/login``.

Until this existed, login had no rate limiting or lockout of any kind —
unlike ``/auth/register`` (``signup_guard``) and
``/auth/forgot-password`` (``password_reset_guard``), an attacker could
attempt unlimited password guesses against any account. Deliberately a
per-IP limiter, not a per-email one: locking an *account* after N failed
attempts (rather than slowing down a *source*) turns into its own
denial-of-service vector — anyone who knows a customer's email could lock
them out of their own account on demand. Per-IP, an attacker instead just
needs many source IPs to brute-force at volume, which is a materially
higher bar and the same tradeoff this codebase already made for signup and
password-reset abuse.

Counts every attempt (successful logins included), matching
``signup_guard``'s own behavior — not just failures — to keep the
implementation identical rather than adding new state (last-failure
tracking) for a narrower guarantee. The default is higher than
``SIGNUP_RATE_LIMIT_PER_HOUR``'s because login, unlike one-time
registration, is something the same legitimate IP (a shared office
connection, several teammates) can hit routinely through a workday.

Same :class:`~app.core.signup_guard.SignupGuard` sliding-window
implementation reused as-is, separate bucket/singleton from the other two
guards. Per-process only, same limitation noted on the class itself.
"""

from __future__ import annotations

from app.core.signup_guard import SignupGuard

_guard: SignupGuard | None = None
_guard_max: int | None = None


def get_login_guard() -> SignupGuard:
    """Module singleton, sized from the current setting — rebuilt if the
    configured limit changes, same pattern as ``get_signup_guard``."""
    global _guard, _guard_max  # noqa: PLW0603
    from app.core.config import settings

    max_per_hour = settings.LOGIN_RATE_LIMIT_PER_HOUR
    if _guard is None or _guard_max != max_per_hour:
        _guard = SignupGuard(max_per_hour)
        _guard_max = max_per_hour
    return _guard


def reset_login_guard() -> None:
    """Reset the singleton (tests only)."""
    global _guard, _guard_max  # noqa: PLW0603
    _guard = None
    _guard_max = None
