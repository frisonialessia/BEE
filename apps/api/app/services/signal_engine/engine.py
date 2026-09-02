"""The Signal Engine (Motor de Señales).

This is the orchestration core of BEE. Given a validated inbound payload it:

1. Resolves the related company and lead (get-or-create).
2. Runs every applicable signal analyzer (Strategy pattern via the registry).
3. Aggregates their verdicts into a single classification and score.
4. Persists the :class:`~app.models.signal.Signal`.
5. Materializes an :class:`~app.models.opportunity.Opportunity` when an analyzer
   proposes a strategy (lead + signal + strategy).
6. Delegates to :class:`~app.services.strategy_generator.StrategyGeneratorService`
   to enrich the opportunity with a CEO battlecard. The engine does not know
   *how* the strategy is generated — only that the service will do it. This
   decoupling means swapping from rule-based to GPT-4o requires zero changes here.

``READY_TO_ACTION`` gate
------------------------
The status transition ``DETECTED → READY_TO_ACTION`` is owned entirely by the
:class:`~app.services.strategy_generator.StrategyGeneratorService`. The engine
calls ``strategy_service.enrich(signal, opportunity)`` and trusts the service to
promote the status iff the battlecard is complete. On failure the opportunity
stays at ``DETECTED``, which is visible in the pipeline as an incomplete record.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlmodel import Session

# Ensure built-in signal analyzers are registered on import.
import app.services.signal_engine.analyzers  # noqa: F401  (registration side effect)
from app.core.logging import get_logger
from app.models.base import EXPANSION, RENEWAL_RISK
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.repositories.company import CompanyRepository
from app.repositories.lead import LeadRepository
from app.repositories.opportunity import OpportunityRepository
from app.repositories.signal import SignalRepository
from app.schemas.signal import SignalWebhookIn
from app.services.revenue_continuity import RevenueContinuityService
from app.services.signal_engine.analyzers import get_analyzers
from app.services.signal_engine.analyzers.base import AnalysisResult
from app.services.strategy_generator import StrategyGeneratorService

logger = get_logger(__name__)


@dataclass(slots=True)
class IngestOutcome:
    """Result of an ingestion run, returned to the API layer."""

    signal: Signal
    opportunity: Opportunity | None
    analyzers_applied: list[str]
    deduplicated: bool = False
    strategy_enriched: bool = False


class SignalEngine:
    """Coordinates analyzers, persistence, and strategy enrichment.

    The engine is constructed with a database session and the strategy service.
    Both are injected (never imported as globals) so each request is isolated and
    both components are independently mockable in tests.
    """

    def __init__(
        self,
        session: Session,
        strategy_service: StrategyGeneratorService | None = None,
    ) -> None:
        self.session = session
        # Defaults to the standard service; tests can pass a mock.
        self.strategy_service = strategy_service or StrategyGeneratorService(session)
        self.companies = CompanyRepository(session)
        self.leads = LeadRepository(session)
        self.signals = SignalRepository(session)
        self.opportunities = OpportunityRepository(session)

    def ingest(
        self,
        payload: SignalWebhookIn,
        *,
        commit: bool = True,
        organization_id: uuid.UUID | None = None,
    ) -> IngestOutcome:
        """Process an inbound webhook payload end-to-end.

        Returns an :class:`IngestOutcome`. If a signal with the same
        ``external_id`` already exists, ingestion is short-circuited (idempotency)
        and the existing signal is returned with ``deduplicated=True``.

        When ``commit=False`` (used by background workers), the caller owns the
        transaction boundary so follow-up enrichment can persist atomically.

        ``organization_id`` — resolved by the caller from an
        :class:`~app.models.organization_api_key.OrganizationApiKey` (see
        ``app.api.deps.get_organization_from_api_key``) — is stamped on every
        record this ingestion run creates or resolves, and used to scope
        company/lead dedup lookups so two organizations never merge into each
        other's data. ``None`` (no key presented) preserves the pre-multi-tenant
        behavior: everything stays untagged and globally visible.
        """
        # 1. Idempotency guard.
        if payload.external_id:
            existing = self.signals.get_by_external_id(payload.external_id)
            if existing is not None:
                logger.info("Duplicate signal ignored: %s", payload.external_id)
                return IngestOutcome(
                    signal=existing, opportunity=None, analyzers_applied=[], deduplicated=True
                )

        # 2. Entity resolution.
        company = self.companies.get_or_create_from_ref(payload.company, organization_id)
        lead = self.leads.get_or_create_from_ref(
            payload.lead, company.id if company else None, organization_id
        )
        # ``last_validated_at`` is only ever None for a lead nobody has run
        # DataValidator against yet — a freshly-created record from the branch
        # above, not one resolved from the email-dedup lookup. This is the
        # "first encounter" hook DataValidator's own docstring describes.
        if lead is not None and lead.last_validated_at is None:
            self._validate_new_lead(lead.id)

        # 3. Signal classification via analyzers.
        applied, aggregate = self._run_analyzers(payload)

        # 4. Persist the signal.
        signal = Signal(
            organization_id=organization_id,
            company_id=company.id if company else None,
            lead_id=lead.id if lead else None,
            signal_type=aggregate.signal_type,
            source=payload.source,
            title=payload.title,
            description=payload.description,
            external_id=payload.external_id,
            score=aggregate.score,
            confidence=aggregate.confidence,
            raw_payload=payload.model_dump(mode="json"),
            analysis={
                "tags": aggregate.tags,
                "analyzers": applied,
                **aggregate.metadata,
            },
        )
        if payload.detected_at is not None:
            signal.detected_at = payload.detected_at
        signal = self.signals.add(signal)

        # 5. Materialize opportunity.
        opportunity: Opportunity | None = None
        strategy_enriched = False
        if aggregate.strategy is not None:
            opportunity = self._create_opportunity(signal, aggregate, organization_id)

            # 6. Enrich battlecard — the engine delegates fully; no strategy logic here.
            strategy_enriched = self.strategy_service.enrich(signal, opportunity)

        # 7. Commit the whole unit of work atomically (unless caller manages txn).
        if commit:
            self.session.commit()
            self.session.refresh(signal)
            if opportunity is not None:
                self.session.refresh(opportunity)
            # 8. Periodically refresh market-wide trend insights (best-effort,
            # throttled, own-transaction callers only — see the method docstring
            # for why commit=False callers skip this entirely).
            self._maybe_run_trend_analysis(organization_id)
        else:
            self.session.flush()
            if opportunity is not None:
                self.session.refresh(opportunity)

        logger.info(
            "Ingested signal %s (type=%s score=%.1f analyzers=%s opportunity=%s ready=%s)",
            signal.id,
            signal.signal_type,
            signal.score,
            applied,
            opportunity.id if opportunity else None,
            strategy_enriched,
        )
        return IngestOutcome(
            signal=signal,
            opportunity=opportunity,
            analyzers_applied=applied,
            strategy_enriched=strategy_enriched,
        )

    def _validate_new_lead(self, lead_id: uuid.UUID) -> None:
        """Run DataValidator against a just-created lead.

        Best-effort: a validation failure must never block signal ingestion,
        the same way anomaly detection and audit logging are non-blocking
        elsewhere in the app. Also rolls back on failure so a broken
        validation run can't poison the shared session for the rest of this
        ingest() call (persisting the signal/opportunity right after).
        """
        try:
            from app.services.data_validator import DataValidator

            DataValidator(self.session).validate_lead(lead_id)
        except Exception:  # noqa: BLE001
            self.session.rollback()
            logger.exception("DataValidator failed for new lead %s", lead_id)

    # Re-run TrendAnalyst every this-many signals for a tenant — cheap enough
    # (a handful of grouped COUNT queries over a 7/14-day window) to run
    # inline, but wasteful to redo on literally every single ingestion.
    _TREND_ANALYSIS_INTERVAL = 20

    def _maybe_run_trend_analysis(self, organization_id: uuid.UUID | None) -> None:
        """Best-effort, throttled: refresh MarketInsight rows periodically.

        There is no scheduler (cron/Celery beat) anywhere in this deployment
        despite TrendAnalyst's own docstring describing one — signal
        ingestion is the only regular heartbeat available, so this makes it
        double as that trigger. Without this, ``StrategyGeneratorService``'s
        market-context input (``ctx.market_insights``) is always empty in
        production, since nothing else ever calls ``TrendAnalyst.analyze()``
        outside the manual ``POST /insights/analyze`` endpoint.

        Only called from the ``commit=True`` branch of :meth:`ingest` —
        ``TrendAnalyst.analyze()`` commits internally, which would prematurely
        end a ``commit=False`` caller's larger transaction (the same hazard
        ``DataValidator._persist`` used to have; see its own history).
        """
        try:
            from sqlmodel import func, select

            from app.models.signal import Signal
            from app.services.permissions import scope_by_organization_id
            from app.services.trend_analyst import TrendAnalyst

            count_stmt = scope_by_organization_id(
                select(func.count(Signal.id)), Signal.organization_id, organization_id
            )
            total = self.session.exec(count_stmt).one()
            if total % self._TREND_ANALYSIS_INTERVAL != 0:
                return
            TrendAnalyst(self.session).analyze(organization_id=organization_id)
        except Exception:  # noqa: BLE001
            self.session.rollback()
            logger.warning("TrendAnalyst run failed during signal ingestion", exc_info=True)

    def _run_analyzers(
        self, payload: SignalWebhookIn
    ) -> tuple[list[str], AnalysisResult]:
        """Execute all supporting analyzers and aggregate their verdicts."""
        results: list[tuple[str, AnalysisResult]] = []
        for analyzer in get_analyzers():
            try:
                if not analyzer.supports(payload):
                    continue
                results.append((analyzer.name, analyzer.analyze(payload)))
            except Exception:  # noqa: BLE001
                logger.exception("Analyzer '%s' failed; skipping.", analyzer.name)

        applied = [name for name, _ in results]

        if not results:
            return applied, AnalysisResult()

        best_name, best = max(results, key=lambda item: item[1].score)
        tags: list[str] = []
        for _, res in results:
            for tag in res.tags:
                if tag not in tags:
                    tags.append(tag)

        aggregate = AnalysisResult(
            signal_type=best.signal_type,
            score=max(res.score for _, res in results),
            confidence=max(res.confidence for _, res in results),
            tags=tags,
            strategy=best.strategy,
            metadata={"primary_analyzer": best_name},
        )
        return applied, aggregate

    # Revenue Continuity Radar — see RevenueContinuityService's module
    # docstring. Purely cosmetic labeling on top of the classification;
    # falling back to the NEW_LOGO prefix for any value this map doesn't
    # recognize keeps this forward-compatible with new buckets.
    _OPPORTUNITY_TITLE_PREFIXES = {
        EXPANSION: "Expansion opportunity",
        RENEWAL_RISK: "Renewal risk",
    }

    def _create_opportunity(
        self,
        signal: Signal,
        aggregate: AnalysisResult,
        organization_id: uuid.UUID | None = None,
    ) -> Opportunity:
        """Build and persist an opportunity in DETECTED state.

        Status will be promoted to READY_TO_ACTION by the strategy service
        after enrichment, not here.
        """
        opportunity_type = RevenueContinuityService(self.session).classify(
            company_id=signal.company_id,
            signal_type=signal.signal_type,
            organization_id=organization_id,
        )
        title_prefix = self._OPPORTUNITY_TITLE_PREFIXES.get(opportunity_type, "Opportunity")
        opportunity = Opportunity(
            organization_id=organization_id,
            signal_id=signal.id,
            lead_id=signal.lead_id,
            company_id=signal.company_id,
            title=f"{title_prefix}: {signal.title}",
            score=signal.score,
            strategy=aggregate.strategy or {},
            opportunity_type=opportunity_type,
        )
        return self.opportunities.add(opportunity)
