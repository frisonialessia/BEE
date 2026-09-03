"""Production middleware for BEE API.

Registers all non-framework middleware in one place so ``main.py`` stays lean:

1. **SecurityHeadersMiddleware** — adds industry-standard HTTP security headers
   to every response. These headers protect the frontend and API consumers from
   a range of common web vulnerabilities.

2. **APIKeyMiddleware** — enforces API key authentication on all endpoints
   except the health checks and signal webhook (which has its own HMAC auth).
   Enabled only when ``settings.API_SECRET_KEY`` is set, so local development
   remains frictionless without any extra configuration.

Design: all middleware is implemented as Starlette-compatible callables so they
work with FastAPI's ASGI stack without any additional dependencies.

Security header rationale
--------------------------
* ``X-Content-Type-Options: nosniff``      — prevents MIME sniffing attacks
* ``X-Frame-Options: DENY``                — blocks clickjacking via iframes
* ``Referrer-Policy: strict-origin``       — limits referrer information leakage
* ``X-XSS-Protection: 1; mode=block``     — legacy XSS filter (defense-in-depth)
* ``Permissions-Policy``                   — disable unused browser APIs
* ``Content-Security-Policy``              — restrictive CSP for API-only origin
* ``Strict-Transport-Security``            — HSTS (only set in non-local envs)
* ``Cache-Control``                        — prevent sensitive data caching

API key design
--------------
The key is passed as ``X-API-Key: <value>``. This is simpler than Bearer tokens
for a CEO dashboard (no token refresh, no OAuth) and easier to rotate.

In production, the key is a 32+ char random string stored in a secret manager
(Vercel Env, Doppler, AWS Secrets Manager) and injected as ``API_SECRET_KEY``.
"""

from __future__ import annotations

import hmac

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_ALWAYS_EXEMPT = frozenset(
    {
        "/",
        "/api/v1/health",
        "/api/v1/ready",
        # Self-serve entry points: BEE is open signup (anyone can create an
        # organization), so these can't sit behind a key nobody outside the
        # frontend bundle knows about — X-API-Key is meant for
        # service-to-service callers (n8n/Zapier/the dashboard's own calls),
        # not for gating the first request a brand-new visitor ever makes.
        # Abuse protection for these two lives elsewhere: signup_guard's
        # per-IP rate limit (+ optional SIGNUP_INVITE_CODE) on /register,
        # and the password check itself on /login.
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        # Same reasoning as the two above: a visitor who forgot their
        # password has no session and shouldn't need a key baked into a
        # frontend bundle to reach the recovery flow. Abuse protection is
        # password_reset_guard's per-IP rate limit + the token comparison
        # itself — see app.api.v1.endpoints.auth.
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        # Same reasoning again: a person hasn't authenticated with BEE at
        # all yet when either of these runs — /lookup is what decides
        # whether to show a password field, /callback is where their IdP
        # sends them back. See app.api.v1.endpoints.sso.
        "/api/v1/auth/sso/lookup",
        "/api/v1/auth/sso/callback",
    }
)


def _path_is_exempt(path: str, exempt: frozenset[str]) -> bool:
    """Exact match first, then prefix match — shared by APIKeyMiddleware
    and APIRateLimitMiddleware's own exempt-path lists.

    NOTE: only entries with len > 1 participate in prefix matching. "/" is
    exact-only — if it were a prefix it would exempt every path (since
    every URL starts with "/"), which would defeat the whole point of
    either list.
    """
    return path in exempt or any(path.startswith(ep) for ep in exempt if ep != path and len(ep) > 1)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard security headers to every HTTP response.

    Headers are added regardless of whether the response is a success,
    redirect, or error so that all traffic benefits from the protection.
    """

    def __init__(self, app, environment: str = "local") -> None:
        super().__init__(app)
        self.environment = environment

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Universal security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )

        # HSTS only in non-local environments (local dev uses HTTP)
        if self.environment != "local":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Enforce API key authentication on all non-exempt endpoints.

    Enabled when ``settings.API_SECRET_KEY`` is set (non-None).
    Disabled (passthrough) in development when the secret is not configured.

    Exempt paths (always allowed without a key):
    * ``/`` — root service metadata
    * ``/api/v1/health`` — health check
    * ``/api/v1/ready`` — readiness probe
    * ``/api/v1/auth/register`` / ``/api/v1/auth/login`` — self-serve entry
      points; see the ``_ALWAYS_EXEMPT`` docstring note above for why
    * Paths in ``settings.API_KEY_EXEMPT_PATHS`` (comma-separated)

    The signal webhook (``POST /api/v1/signals/ingest``) has its own HMAC
    authentication and is not exempt here — it still requires the API key
    so that unauthorized callers cannot discover the webhook endpoint at all.

    Usage (frontend / n8n / Zapier):
    ```
    curl -H "X-API-Key: your-secret-key" https://api.bee.io/api/v1/opportunities
    ```

    Timing-safe comparison is used to prevent timing attacks on the key.
    """

    _HEADER = "x-api-key"

    def __init__(self, app) -> None:
        super().__init__(app)
        self.settings = get_settings()
        self._secret = self.settings.API_SECRET_KEY
        self._enabled = self._secret is not None

        # Build exempt path set
        exempt = set(_ALWAYS_EXEMPT)
        if self.settings.API_KEY_EXEMPT_PATHS:
            for path in self.settings.API_KEY_EXEMPT_PATHS.split(","):
                path = path.strip()
                if path:
                    exempt.add(path)
        self._exempt = frozenset(exempt)

        if self._enabled:
            logger.info("APIKeyMiddleware: enabled — API endpoints require X-API-Key header")
        else:
            logger.warning(
                "APIKeyMiddleware: DISABLED (API_SECRET_KEY not set). "
                "All endpoints are publicly accessible. "
                "Set API_SECRET_KEY to enable authentication."
            )

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self._enabled:
            return await call_next(request)

        # CORS pre-flight requests never carry custom headers (X-API-Key
        # included) — that's how browsers do CORS. Rejecting OPTIONS here
        # would 401 every pre-flight and the browser would never send the
        # real request, regardless of how CORSMiddleware is ordered relative
        # to this one. CORSMiddleware still decides whether the pre-flight's
        # origin is actually allowed.
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        if _path_is_exempt(path, self._exempt):
            return await call_next(request)

        provided_key = request.headers.get(self._HEADER)

        if not provided_key:
            logger.warning(
                "APIKeyMiddleware: rejected request — missing X-API-Key header. path=%s",
                path,
            )
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Missing API key. Include the X-API-Key header.",
                    "hint": "Contact the BEE system administrator for your API key.",
                },
            )

        # Timing-safe comparison to prevent key enumeration
        if not self._is_valid_key(provided_key):
            logger.warning(
                "APIKeyMiddleware: rejected request — invalid X-API-Key. path=%s", path
            )
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid API key."},
            )

        return await call_next(request)

    def _is_valid_key(self, provided: str) -> bool:
        """Constant-time comparison to prevent timing attacks."""
        if not self._secret:
            return False
        return hmac.compare_digest(
            provided.encode("utf-8"),
            self._secret.encode("utf-8"),
        )


class APIRateLimitMiddleware(BaseHTTPMiddleware):
    """General per-IP rate limit across the broad API surface — see
    ``app.core.api_rate_limit_guard``'s module docstring for why this
    exists alongside the auth-flow-specific guards, and why its window is
    much shorter (60s) than theirs (3600s).

    Always registered (unlike APIKeyMiddleware, which only activates when
    API_SECRET_KEY is set) — API_RATE_LIMIT_PER_MINUTE <= 0 is this
    middleware's own off switch, same "0 disables the check" convention
    every guard in this codebase already uses, checked fresh on every
    request via the guard singleton rather than cached at __init__ time,
    so changing the setting takes effect without a restart in tests.
    """

    def __init__(self, app) -> None:  # noqa: ANN001
        super().__init__(app)
        settings = get_settings()
        # Deliberately NOT built from _ALWAYS_EXEMPT — that set exists so
        # self-serve entry points never require an API key, which is a
        # different question from whether they should be throttled (they
        # should: /auth/register and /auth/login already have their own
        # tighter dedicated guards, but a general backstop underneath them
        # is still worth having, not a reason to exempt them here too).
        # Starts from API_RATE_LIMIT_EXEMPT_PATHS alone.
        exempt: set[str] = set()
        if settings.API_RATE_LIMIT_EXEMPT_PATHS:
            for path in settings.API_RATE_LIMIT_EXEMPT_PATHS.split(","):
                path = path.strip()
                if path:
                    exempt.add(path)
        self._exempt = frozenset(exempt)

    async def dispatch(self, request: Request, call_next) -> Response:
        # Same CORS pre-flight carve-out as APIKeyMiddleware — an OPTIONS
        # request never carries real intent to call the endpoint and must
        # never be the thing that exhausts a legitimate caller's quota.
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if _path_is_exempt(path, self._exempt):
            return await call_next(request)

        from app.core.api_rate_limit_guard import get_api_rate_limit_guard
        from app.core.client_ip import get_client_ip

        guard = get_api_rate_limit_guard()
        client_ip = get_client_ip(request)
        if not guard.try_consume(client_ip):
            logger.warning("APIRateLimitMiddleware: rate limit exceeded. ip=%s path=%s", client_ip, path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Try again shortly."},
                headers={"Retry-After": "60"},
            )

        return await call_next(request)
