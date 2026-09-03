"""Cron entry point for the daily digest — Vercel Cron only.

Same ``CRON_SECRET`` Bearer-auth pattern as ``internal_market_scan.py``
and ``internal_job_queue.py`` (see those docstrings for why). Runs hourly;
``DailyDigestService.run_tick`` decides which organizations are due at
this hour and skips the rest, so the schedule stays one line in
``vercel.json`` regardless of how many organizations pick which hour.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session

from app.core.config import get_settings
from app.core.database import get_session
from app.schemas.digest import DigestTickOut
from app.services.digest import DailyDigestService

router = APIRouter(prefix="/internal/digest", tags=["Internal Daily Digest (cron only)"])


def _require_cron_secret(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.CRON_SECRET:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    expected = f"Bearer {settings.CRON_SECRET}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing cron secret.")


@router.get(
    "/tick",
    response_model=DigestTickOut,
    summary="[Vercel Cron only] Send the daily digest to every organization due this hour",
    dependencies=[Depends(_require_cron_secret)],
)
def run_tick(session: Session = Depends(get_session)) -> DigestTickOut:
    summary = DailyDigestService(session).run_tick()
    return DigestTickOut(
        organizations_checked=summary.organizations_checked,
        sent=summary.sent,
        skipped=summary.skipped,
        duration_ms=summary.duration_ms,
        errors=summary.errors,
    )
