"""Cron entry point for the proactive market-scan pipeline — Vercel Cron
only, not a customer- or frontend-facing endpoint.

Why GET, and why Authorization: Bearer instead of a custom header
--------------------------------------------------------------------
Vercel Cron Jobs issue a plain HTTP GET to the configured path on schedule
(https://vercel.com/docs/cron-jobs) — no request body, no custom headers.
When a project env var named exactly ``CRON_SECRET`` is set, Vercel
auto-injects ``Authorization: Bearer $CRON_SECRET`` on every cron-triggered
request, which is the only authentication mechanism available to a cron
invocation. That's why this endpoint's secret is named ``CRON_SECRET`` (not
a BEE-prefixed name like ``SUPPORT_ADMIN_SECRET``) and checked against the
``Authorization`` header specifically — matching Vercel's own convention is
what makes the injection actually happen, not a stylistic choice.

Also exempt from the ``X-API-Key`` middleware (see
``API_KEY_EXEMPT_PATHS`` in ``app.core.config``) for the same reason the
webhook receive endpoint is: Vercel's cron invocation cannot be configured
to send it, so this endpoint's own Bearer check is its real authentication,
not a second layer on top of one.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session

from app.core.config import get_settings
from app.core.database import get_session
from app.schemas.market_scan import MarketScanTickOut
from app.services.market_scan import MarketScanOrchestrator

router = APIRouter(prefix="/internal/market-scan", tags=["Internal Market Scan (cron only)"])


def _require_cron_secret(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.CRON_SECRET:
        # Same "unset -> 404, not a locked 401/403" convention as
        # SUPPORT_ADMIN_SECRET: a deployment that never opted in shouldn't
        # even reveal this route exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    expected = f"Bearer {settings.CRON_SECRET}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing cron secret.")


@router.get(
    "/tick",
    response_model=MarketScanTickOut,
    summary="[Vercel Cron only] Run one market-scan scheduling tick",
    dependencies=[Depends(_require_cron_secret)],
)
def run_tick(session: Session = Depends(get_session)) -> MarketScanTickOut:
    summary = MarketScanOrchestrator(session).run_tick()
    return MarketScanTickOut(
        enabled=summary.enabled,
        companies_scanned=summary.companies_scanned,
        signals_created=summary.signals_created,
        duration_ms=summary.duration_ms,
        errors=summary.errors,
    )
