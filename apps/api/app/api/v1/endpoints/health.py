"""Health and readiness endpoints for infrastructure probes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from app.core.config import settings
from app.core.database import get_session

router = APIRouter(tags=["System"])


@router.get("/health", summary="Liveness probe")
def health() -> dict[str, str]:
    """Return basic liveness info. Used by load balancers / orchestrators."""
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }


@router.get("/ready", summary="Readiness probe (checks the database)")
def ready(session: Session = Depends(get_session)) -> dict[str, str]:
    """Verify the database connection is usable before accepting traffic."""
    session.execute(text("SELECT 1"))
    return {"status": "ready"}
