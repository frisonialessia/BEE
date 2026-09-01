"""MarketScanOrchestrator — the proactive market-scan background pipeline.

Runs as a Vercel Cron tick, not a persistent process: ``bee-api`` is a
serverless FastAPI deployment (single ``api/index.py``, ``maxDuration: 60``
in ``apps/api/vercel.json``) — there is no long-lived process to host a
traditional scheduler (APScheduler, a ``while True`` loop). See
``app.api.v1.endpoints.internal_market_scan`` for the endpoint Vercel Cron
invokes on a schedule.

Why a timestamp cursor instead of a queue
------------------------------------------
``Company.next_scan_due_at`` (see that model's docstring) *is* the queue:
each tick pulls whichever companies are due, oldest-due-first, across every
organization — fair scheduling with no separate queue infrastructure,
appropriate at MVP-to-early-growth scale. ``DEPLOY_CHECKLIST.md`` already
flags the existing in-process ``IngestionWorker`` (``asyncio.Queue``) as not
surviving Vercel's per-instance lifecycle; the same reasoning is why this
pipeline is designed around the database as the source of truth from the
start rather than in-memory state, instead of inheriting that same gap.

Phase 1 scope (this module, today)
------------------------------------
This orchestrator currently does the scheduling — pick due companies,
advance their cursor, record a ``MarketScanLog`` row — but ``_scan_company``
is a placeholder that produces zero signals. No external provider is wired
yet. This lets the cron plumbing (Vercel Cron → auth → tick → cursor
advance → audit log) be deployed and verified safely, behind
``MARKET_SCAN_ENABLED=false``, before any real provider call is added.

Next phases (not in this module yet)
--------------------------------------
* A ``GoogleNewsProvider``/extended ``GoogleSearchProvider`` and a new
  ``HiringProvider``, both implementing
  ``app.services.external_api.interface.IExternalProvider`` — the same
  contract ``LinkedInProvider``/``G2Provider`` already use — registered on
  ``ExternalAPIOrchestrator`` and called from ``_scan_company`` below.
* Raw results normalized into ``Signal`` rows via the existing
  ``SignalEngine`` — reusing ``SignalType.HIRING``/``SignalType.NEWS_MENTION``
  (already defined in ``app.models.base``) and the new
  ``SignalSource.MARKET_SCAN`` — not a parallel ingestion path.
* A pgvector semantic fallback (``app.services.vector_store``) for signals
  that don't literally name the tracked company.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.base import utcnow
from app.models.company import Company
from app.models.market_scan_log import MarketScanLog

logger = get_logger(__name__)


@dataclass(slots=True)
class TickSummary:
    """What one tick did — also what the internal endpoint returns."""

    enabled: bool
    companies_scanned: int = 0
    signals_created: int = 0
    duration_ms: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)


class MarketScanOrchestrator:
    """Picks due companies and runs a market scan pass over each."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.settings = get_settings()

    def run_tick(self) -> TickSummary:
        """Run one scheduling tick. Safe to call even when disabled.

        When ``MARKET_SCAN_ENABLED`` is false, returns immediately with
        ``enabled=False`` and does not touch ``Company`` rows — this is what
        lets the Vercel Cron job + ``CRON_SECRET`` auth be wired and
        confirmed working (a real HTTP call arrives, a real 200 comes back)
        independently of turning the feature itself on.
        """
        if not self.settings.MARKET_SCAN_ENABLED:
            return TickSummary(enabled=False)

        start = time.monotonic()
        summary = TickSummary(enabled=True)

        due = self.session.exec(
            select(Company)
            .where(
                (Company.next_scan_due_at == None)  # noqa: E711 — SQLAlchemy needs `== None`, not `is None`
                | (Company.next_scan_due_at <= utcnow())
            )
            .order_by(Company.next_scan_due_at.is_(None).desc(), Company.next_scan_due_at)
            .limit(self.settings.MARKET_SCAN_BATCH_SIZE)
        ).all()

        interval = timedelta(hours=self.settings.MARKET_SCAN_INTERVAL_HOURS)
        for company in due:
            try:
                signals_created = self._scan_company(company)
                summary.signals_created += signals_created
            except Exception as exc:  # noqa: BLE001 — one bad company must not abort the batch
                logger.exception("MarketScanOrchestrator: scan failed for company_id=%s", company.id)
                summary.errors.append({"company_id": str(company.id), "error": str(exc)[:200]})
            finally:
                # Cursor advances even on error — a company that keeps
                # failing (bad domain, provider outage) must not permanently
                # jam the front of the queue ahead of everyone else; it just
                # gets retried next interval like everyone.
                company.last_scanned_at = utcnow()
                company.next_scan_due_at = utcnow() + interval
                self.session.add(company)
                summary.companies_scanned += 1

        self.session.commit()

        summary.duration_ms = int((time.monotonic() - start) * 1000)
        self.session.add(
            MarketScanLog(
                companies_scanned=summary.companies_scanned,
                signals_created=summary.signals_created,
                errors=summary.errors,
                duration_ms=summary.duration_ms,
            )
        )
        self.session.commit()

        logger.info(
            "MarketScanOrchestrator tick: companies=%d signals=%d duration_ms=%d errors=%d",
            summary.companies_scanned,
            summary.signals_created,
            summary.duration_ms,
            len(summary.errors),
        )
        return summary

    def _scan_company(self, company: Company) -> int:  # noqa: ARG002 — Phase 1 placeholder, see docstring
        """Scan one company across every configured market-scan provider.

        Placeholder for Phase 1 — see this module's docstring. Returns the
        number of Signal rows created (always 0 today). Deliberately takes
        just the company, not the provider list: Phase 2/3 wire
        ExternalAPIOrchestrator providers in here directly rather than
        threading them through run_tick's signature, so this stays the one
        place that changes when a provider is added.
        """
        return 0
