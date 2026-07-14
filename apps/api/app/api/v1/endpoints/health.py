"""Health and readiness endpoints for infrastructure probes.

Three tiers:
  /health  — liveness probe (always fast; no I/O)
  /ready   — readiness probe (checks DB before accepting traffic)
  /status  — deep observability check (DB + VectorStore + DLQ + Auth config)
             Never called by a load-balancer; intended for ops dashboards and
             the CEO's BEE System Health view.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

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


@router.get("/status", summary="Deep system status — DB, VectorStore, DLQ, Auth")
def deep_status(session: Session = Depends(get_session)) -> dict:
    """Return a comprehensive health snapshot for ops/CEO dashboards.

    Checks every critical subsystem and reports status, latency, and key
    metrics so a single call tells the operator whether BEE is fully operational.

    This endpoint is NOT called by infrastructure probes — it's for humans.
    It always returns HTTP 200 (status is in the response body) so dashboards
    don't alarm on degraded-but-functional subsystems.
    """
    checks: dict[str, dict] = {}

    # ── 1. Database ──────────────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        session.execute(text("SELECT 1"))
        latency_ms = int((time.monotonic() - t0) * 1000)

        # Count key entities for a quick data health summary
        from sqlalchemy import func
        from sqlmodel import select

        from app.models.opportunity import Opportunity

        opp_count = session.exec(select(func.count()).select_from(Opportunity)).one()
        checks["database"] = {
            "status": "ok",
            "latency_ms": latency_ms,
            "opportunities": opp_count,
        }
    except Exception as exc:  # noqa: BLE001
        checks["database"] = {
            "status": "error",
            "error": str(exc)[:200],
            "latency_ms": int((time.monotonic() - t0) * 1000),
        }

    # ── 2. VectorKnowledgeBase (Sales DNA) ───────────────────────────────────
    t0 = time.monotonic()
    try:
        from app.services.vector_store import get_vector_store

        store = get_vector_store()
        doc_count = store.count()
        latency_ms = int((time.monotonic() - t0) * 1000)
        checks["vector_store"] = {
            "status": "ok",
            "backend": type(store).__name__,
            "documents": doc_count,
            "latency_ms": latency_ms,
            "note": (
                "Using MockVectorStore (in-memory). Configure VECTOR_STORE_BACKEND "
                "for persistent production storage."
            )
            if type(store).__name__ == "MockVectorStore"
            else None,
        }
    except Exception as exc:  # noqa: BLE001
        checks["vector_store"] = {
            "status": "error",
            "error": str(exc)[:200],
        }

    # ── 3. Dead Letter Queue (failed events) ─────────────────────────────────
    t0 = time.monotonic()
    try:
        from sqlalchemy import func
        from sqlmodel import select

        from app.models.dead_letter import DLQStatus, FailedEvent

        pending = session.exec(
            select(func.count())
            .select_from(FailedEvent)
            .where(FailedEvent.status.in_([DLQStatus.PENDING, DLQStatus.RETRYING]))
        ).one()
        failed = session.exec(
            select(func.count())
            .select_from(FailedEvent)
            .where(FailedEvent.status == DLQStatus.PERMANENTLY_FAILED)
        ).one()
        latency_ms = int((time.monotonic() - t0) * 1000)
        checks["dead_letter_queue"] = {
            "status": "warning" if failed > 0 else "ok",
            "pending_retries": pending,
            "permanently_failed": failed,
            "latency_ms": latency_ms,
        }
    except Exception as exc:  # noqa: BLE001
        checks["dead_letter_queue"] = {
            "status": "error",
            "error": str(exc)[:200],
        }

    # ── 4. Pending Actions (CEO approval queue) ───────────────────────────────
    t0 = time.monotonic()
    try:
        from sqlalchemy import func
        from sqlmodel import select

        from app.models.base import ActionStatus
        from app.models.pending_action import PendingAction

        pending_approvals = session.exec(
            select(func.count())
            .select_from(PendingAction)
            .where(PendingAction.status == ActionStatus.PENDING_APPROVAL)
        ).one()
        latency_ms = int((time.monotonic() - t0) * 1000)
        checks["agent_orchestrator"] = {
            "status": "ok",
            "pending_approvals": pending_approvals,
            "latency_ms": latency_ms,
        }
    except Exception as exc:  # noqa: BLE001
        checks["agent_orchestrator"] = {
            "status": "error",
            "error": str(exc)[:200],
        }

    # ── 5. Security configuration ─────────────────────────────────────────────
    api_auth_enabled = bool(settings.API_SECRET_KEY)
    webhook_auth_enabled = settings.WEBHOOK_SIGNATURE_REQUIRED
    checks["security"] = {
        "api_key_auth": "enabled" if api_auth_enabled else "DISABLED — set API_SECRET_KEY",
        "webhook_hmac": "enabled" if webhook_auth_enabled else "disabled (ok for local)",
        "environment": settings.ENVIRONMENT,
        "production_ready": api_auth_enabled and settings.ENVIRONMENT != "local",
    }

    # ── 6. AI configuration ───────────────────────────────────────────────────
    checks["ai"] = {
        "provider": settings.AI_PROVIDER,
        "model": settings.AI_MODEL,
        "status": (
            "rule-based fallback (no cost)"
            if settings.AI_PROVIDER == "none"
            else "configured"
        ),
    }

    # ── Overall system status ─────────────────────────────────────────────────
    all_ok = all(v.get("status") in ("ok", "warning") for v in checks.values())
    has_warning = any(v.get("status") == "warning" for v in checks.values())

    return {
        "overall": "ok" if all_ok and not has_warning else "warning" if all_ok else "degraded",
        "timestamp": datetime.now(UTC).isoformat(),
        "version": settings.PROJECT_NAME,
        "checks": checks,
    }
