"""Cron entry point for draining the durable job queue — Vercel Cron only,
not a customer- or frontend-facing endpoint. See
``app.services.job_queue``'s module docstring for why this exists (no
persistent worker process on a serverless deployment) and
``app.services.external_api.worker.run_job_queue_tick`` for the actual
draining/processing logic this endpoint calls unchanged.

Same ``CRON_SECRET`` Bearer-auth pattern as
``internal_market_scan.py``'s tick endpoint — see that module's docstring
for exactly why (Vercel Cron's auto-injected ``Authorization`` header is
the only authentication mechanism available to a cron invocation).
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.config import get_settings
from app.schemas.job_queue import JobQueueTickOut
from app.services.external_api.worker import run_job_queue_tick

router = APIRouter(prefix="/internal/jobs", tags=["Internal Job Queue (cron only)"])


def _require_cron_secret(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.CRON_SECRET:
        # Same "unset -> 404, not a locked 401/403" convention as
        # internal_market_scan.py — a deployment that never opted in
        # shouldn't even reveal this route exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    expected = f"Bearer {settings.CRON_SECRET}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing cron secret.")


@router.get(
    "/tick",
    response_model=JobQueueTickOut,
    summary="[Vercel Cron only] Drain one batch of the durable job queue",
    dependencies=[Depends(_require_cron_secret)],
)
def run_tick() -> JobQueueTickOut:
    summary = run_job_queue_tick()
    return JobQueueTickOut(
        enabled=summary.enabled,
        processed=summary.processed,
        rescheduled=summary.rescheduled,
        dead_lettered=summary.dead_lettered,
        remaining_depth=summary.remaining_depth,
        duration_ms=summary.duration_ms,
    )
