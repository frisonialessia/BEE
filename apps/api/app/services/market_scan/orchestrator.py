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

Phase 1 vs. Phase 2
--------------------
Phase 1 built the scheduling shell — pick due companies, advance their
cursor, record a ``MarketScanLog`` row — with ``_scan_company`` as a
placeholder producing zero signals, so the cron plumbing (Vercel Cron →
auth → tick → cursor advance → audit log) could be deployed and verified
safely behind ``MARKET_SCAN_ENABLED=false`` before any provider call
existed.

Phase 2 (this revision) wires the first real provider: Google Search's
market-news query (``ExternalAPIOrchestrator.scan_market_news`` →
``GoogleSearchProvider.search_market_news``, mock-safe when
``GOOGLE_SEARCH_API_KEY``/``GOOGLE_SEARCH_CX`` aren't configured — see
that provider's docstring for why mock mode returns zero items here
rather than a plausible fake headline). Results are normalized into
``Signal`` rows through :class:`~app.services.signal_engine.engine.SignalEngine`
— the *same* entry point ``POST /api/v1/signals/webhook`` uses — not a
parallel ingestion path, so every downstream consumer (opportunity
creation, strategy generation, the Control/Overview bento-grid) picks
these up with zero changes.

Not in this module yet (Phase 3)
-----------------------------------
* A ``HiringProvider`` (same ``IExternalProvider`` contract).
* A pgvector semantic fallback (``app.services.vector_store``) for signals
  that don't literally name the tracked company — today's exact-match-only
  query (the company's own name, quoted) misses indirect mentions.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.base import SignalSource, SignalType, utcnow
from app.models.company import Company
from app.models.market_scan_log import MarketScanLog
from app.schemas.signal import CompanyRef, SignalWebhookIn
from app.services.external_api.orchestrator import ExternalAPIOrchestrator
from app.services.signal_engine.engine import SignalEngine

logger = get_logger(__name__)

# Cap on how many news items become Signal rows per company per tick — a
# noisy week for one account (several qualifying headlines) shouldn't flood
# its own pipeline; the top few (Google already ranks by relevance) are
# what a rep actually needs to see.
_MAX_SIGNALS_PER_COMPANY = 3


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

    def _scan_company(self, company: Company) -> int:
        """Scan one company across every configured market-scan provider.

        Today: Google Search's market-news query only (Phase 2). Returns
        the number of Signal rows actually created — a scan that finds
        news already ingested on a prior tick reports 0 here even though
        the provider call succeeded, since SignalEngine's own
        external_id-based idempotency (see below) deduplicates it.
        """
        if not company.name:
            return 0  # nothing to search on

        news = ExternalAPIOrchestrator(self.session).scan_market_news(
            company_domain=company.domain or company.name,
            company_name=company.name,
        )
        if not news.success or not news.items:
            return 0

        engine = SignalEngine(self.session)
        company_ref = CompanyRef(name=company.name, domain=company.domain)
        created = 0

        for item in news.items[:_MAX_SIGNALS_PER_COMPANY]:
            title = item.get("title")
            if not title:
                continue
            # Deterministic idempotency key from the article URL (falls
            # back to the title when a provider omits a link) — the same
            # article turning up on a later tick must not create a second
            # Signal for it. Scoped to this company: two tracked companies
            # legitimately mentioned in the same article each get their own.
            dedup_source = item.get("link") or title
            external_id = (
                f"market_scan:google_search:{company.id}:"
                f"{hashlib.sha256(dedup_source.encode()).hexdigest()[:16]}"
            )
            payload = SignalWebhookIn(
                title=title,
                event="market_scan.google_news",
                description=item.get("snippet"),
                # Pre-classified as NEWS_MENTION — SignalEngine's analyzers
                # still run and may refine score/confidence, same as any
                # other pre-typed webhook payload.
                signal_type=SignalType.NEWS_MENTION,
                source=SignalSource.MARKET_SCAN,
                external_id=external_id,
                company=company_ref,
                data={"provider": "google_search", "link": item.get("link"), "mock": news.mock},
            )
            outcome = engine.ingest(payload, commit=False, organization_id=company.organization_id)
            if not outcome.deduplicated:
                created += 1

        return created
