"""General rate limiting for the broad API surface — see
``app.core.middleware.APIRateLimitMiddleware``.

Every self-serve/auth flow already has its own dedicated, tighter guard
(``signup_guard``, ``login_guard``, ``password_reset_guard``,
``replay_guard`` for webhook signatures) — but until now the rest of the
API had nothing: no throttle on the broad CRUD surface or the AI/analytics
endpoints (scenario simulation, orchestrator polling, ...), which are
genuinely expensive per call. A compromised or scripted client could
hammer any of those unchecked.

Deliberately a much shorter window (60s, not the other guards' 3600s) at a
much higher per-window count — this is meant to catch volumetric abuse
(a script firing hundreds of requests a second), not to be felt by normal
dashboard usage (a rep clicking around generates dozens of requests a
minute, not hundreds). Per-IP, same tradeoff as every other guard in this
module: this middleware runs before auth is resolved (it's registered
ahead of route dispatch), so there is no user/org identity to key on yet.
"""

from __future__ import annotations

from app.core.signup_guard import SignupGuard

_WINDOW_SECONDS = 60

_guard: SignupGuard | None = None
_guard_max: int | None = None


def get_api_rate_limit_guard() -> SignupGuard:
    """Module singleton, sized from the current setting — rebuilt if the
    configured limit changes, same pattern as ``get_login_guard``."""
    global _guard, _guard_max  # noqa: PLW0603
    from app.core.config import settings

    max_per_window = settings.API_RATE_LIMIT_PER_MINUTE
    if _guard is None or _guard_max != max_per_window:
        _guard = SignupGuard(max_per_window, redis_namespace="api_rate_limit", window_seconds=_WINDOW_SECONDS)
        _guard_max = max_per_window
    return _guard


def reset_api_rate_limit_guard() -> None:
    """Reset the singleton (tests only)."""
    global _guard, _guard_max  # noqa: PLW0603
    _guard = None
    _guard_max = None
