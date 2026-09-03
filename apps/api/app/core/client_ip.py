"""Best-effort caller IP — shared by every per-IP rate limiter in this
codebase (signup_guard, login_guard, password_reset_guard, and
api_rate_limit_guard's middleware).

``request.client.host`` is the proxy's address behind most PaaS
deployments (Vercel included) unless the real client IP is forwarded —
fall back to a fixed key rather than raising, so a missing header degrades
to "one shared bucket" instead of breaking the request entirely.

Extracted from what was ``app.api.v1.endpoints.auth._client_key`` once
``APIRateLimitMiddleware`` needed the exact same logic outside an endpoint
function (a middleware has no dependency-injected ``Request`` the way a
route handler does, but it does get the raw Starlette ``Request``, same
type this already worked with).
"""

from __future__ import annotations

from starlette.requests import Request


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
