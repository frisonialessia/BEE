"""FastAPI application factory and entrypoint.

Keeping app construction in a factory (:func:`create_app`) keeps startup wiring
in one place and makes it easy to build differently-configured apps for tests.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import init_db
from app.core.logging import configure_logging, get_logger
from app.core.middleware import APIKeyMiddleware, SecurityHeadersMiddleware
from app.core.tracing import setup_tracing
from app.services.events import register_listeners

logger = get_logger(__name__)

# Registered at import time, not inside lifespan() below — this needs to be
# guaranteed regardless of whether a given test harness's TestClient
# actually drives the lifespan context manager, and register_listeners()
# is idempotent and does nothing DB/IO-bound, so there's no startup-order
# reason to defer it. See app.services.events.dispatcher for what this
# wires up and why it exists.
register_listeners()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan hook.

    On startup we configure logging, ensure the schema exists, and start the
    async external ingestion worker. Cleanup stops the worker gracefully.
    """
    configure_logging()
    logger.info("Starting %s v%s (env=%s)", settings.PROJECT_NAME, __version__, settings.ENVIRONMENT)

    # Schema provisioning: in local/staging, create_all() is a zero-friction
    # convenience so the app is usable straight out of `docker compose up`. In
    # production, schema changes must go through Alembic (see
    # `alembic/versions/000_baseline_domain_models.py` onward) so they're
    # versioned and reversible — running create_all() there too would silently
    # paper over a missing/failed migration instead of failing loudly.
    if settings.ENVIRONMENT == "production":
        logger.info("ENVIRONMENT=production — skipping init_db(); schema is managed by Alembic.")
    else:
        try:
            init_db()
        except Exception:  # noqa: BLE001 - never crash startup if DB is unavailable in dev
            logger.exception("Database initialization skipped/failed; check DATABASE_URL.")

    # Start background ingestion worker (asyncio.Queue — non-blocking external API calls)
    # Disabled during pytest — worker uses the production DB engine, not the test SQLite engine.
    import sys

    worker = None
    if settings.EXTERNAL_INGESTION_ENABLED and "pytest" not in sys.modules:
        from app.services.external_api.worker import get_ingestion_worker

        worker = get_ingestion_worker()
        await worker.start()

    yield

    if worker is not None:
        await worker.stop()
    logger.info("Shutting down %s", settings.PROJECT_NAME)


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    # Must run before FastAPI(...) below — sentry_sdk needs to see the
    # Starlette/FastAPI integration registered before the app it instruments
    # exists. Skipped under pytest for the same reason the ingestion worker
    # is below: create_app() runs once per test via the client fixture
    # (hundreds of times a suite), and re-registering the Starlette/FastAPI
    # integration's instrumentation that many times in one process is
    # needless overhead with SENTRY_DSN never set in tests anyway (dsn=None
    # is a safe no-op, but skipping outright avoids paying init cost
    # hundreds of times for a no-op).
    import sys

    if "pytest" not in sys.modules:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            release=__version__,
        )

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=__version__,
        description=(
            "BEE — Sales Force Intelligence. A living system that detects and "
            "executes sales opportunities from real-time market signals."
        ),
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Starlette's add_middleware() *inserts* each call at the front of the
    # stack, so the LAST call registered here ends up outermost — the first
    # thing that sees the request, the last thing that touches the response.
    # Register in the *reverse* of execution order:

    # 3. Security headers — innermost, applied to every response including errors.
    app.add_middleware(SecurityHeadersMiddleware, environment=settings.ENVIRONMENT)

    # 2. API key authentication — enabled only when API_SECRET_KEY is set.
    app.add_middleware(APIKeyMiddleware)

    # 1. CORS — registered LAST so it's outermost and handles pre-flight
    #    OPTIONS requests before APIKeyMiddleware ever sees them. Browsers
    #    never attach custom headers (X-API-Key included) to a pre-flight
    #    request, so if APIKeyMiddleware ran first it would 401 every
    #    pre-flight and the browser would never send the real request —
    #    exactly what broke cross-origin calls from apps/web once
    #    API_SECRET_KEY was set in production.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        # None (the default) is a no-op — Starlette only applies the regex
        # check when it's set. See BACKEND_CORS_ORIGIN_REGEX's own comment
        # in config.py for why this exists alongside the exact-match list.
        allow_origin_regex=settings.BACKEND_CORS_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", "X-API-Key"],
    )

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    # Same "skip under pytest" reasoning as sentry_sdk.init() above — a
    # no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset anyway (never set in
    # tests), so skipping outright avoids re-instrumenting FastAPI/
    # SQLAlchemy/httpx hundreds of times across the test suite's own
    # create_app() calls for zero benefit.
    if "pytest" not in sys.modules:
        setup_tracing(app)

    @app.get("/", tags=["System"], summary="Service root")
    def root() -> dict[str, str]:
        return {
            "name": settings.PROJECT_NAME,
            "version": __version__,
            "docs": "/docs",
        }

    return app


app = create_app()
