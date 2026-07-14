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

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan hook.

    On startup we configure logging and ensure the schema exists (convenient for
    local/dev; production should rely on migrations). Cleanup logic can be added
    after the ``yield`` as the platform grows (closing pools, flushing metrics).
    """
    configure_logging()
    logger.info("Starting %s v%s (env=%s)", settings.PROJECT_NAME, __version__, settings.ENVIRONMENT)
    try:
        init_db()
    except Exception:  # noqa: BLE001 - never crash startup if DB is unavailable in dev
        logger.exception("Database initialization skipped/failed; check DATABASE_URL.")
    yield
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

    # CORS so the Next.js frontend can call the API from the browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
