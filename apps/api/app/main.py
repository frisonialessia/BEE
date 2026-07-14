"""FastAPI application factory and entrypoint.

Keeping app construction in a factory (:func:`create_app`) keeps startup wiring
in one place and makes it easy to build differently-configured apps for tests.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import init_db
from app.core.logging import configure_logging, get_logger
from app.core.middleware import APIKeyMiddleware, SecurityHeadersMiddleware

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan hook.

    On startup we configure logging, ensure the schema exists, and start the
    async external ingestion worker. Cleanup stops the worker gracefully.
    """
    configure_logging()
    logger.info("Starting %s v%s (env=%s)", settings.PROJECT_NAME, __version__, settings.ENVIRONMENT)
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

    # Middleware stack is applied in reverse registration order.
    # Outermost (last added) runs first on request, first on response.

    # 1. CORS — must be outermost so pre-flight OPTIONS requests are handled
    #    before any auth check (browsers send OPTIONS without credentials).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", "X-API-Key"],
    )

    # 2. API key authentication — runs after CORS, before business logic.
    #    Enabled only when API_SECRET_KEY is configured.
    app.add_middleware(APIKeyMiddleware)

    # 3. Security headers — innermost, applied to every response including errors.
    app.add_middleware(SecurityHeadersMiddleware, environment=settings.ENVIRONMENT)

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", tags=["System"], summary="Service root")
    def root() -> dict[str, str]:
        return {
            "name": settings.PROJECT_NAME,
            "version": __version__,
            "docs": "/docs",
        }

    return app


app = create_app()
