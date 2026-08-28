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

_ALWAYS_EXEMPT = frozenset({"/", "/api/v1/health", "/api/v1/ready"})


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

        # Check exact match first, then prefix match.
        # NOTE: Only paths with len > 1 participate in prefix matching.
        # "/" is exact-only — if it were a prefix it would exempt every path
        # (since every URL starts with "/"), which would defeat all authentication.
        if path in self._exempt or any(
            path.startswith(ep)
            for ep in self._exempt
            if ep != path and len(ep) > 1
        ):
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
