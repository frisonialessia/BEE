"""The Signal Engine (Motor de Señales).

This is the orchestration core of BEE. Given a validated inbound payload it:

1. Resolves the related company and lead (get-or-create).
2. Runs every applicable analyzer (Strategy pattern via the registry).
3. Aggregates their verdicts into a single classification and score.
4. Persists the :class:`~app.models.signal.Signal`.
5. Materializes an :class:`~app.models.opportunity.Opportunity` when an analyzer
   proposes a strategy (lead + signal + strategy).

The engine depends only on abstractions — repositories and the analyzer
interface — so it is fully unit-testable and open to extension. Dropping in an
AI analyzer requires **zero** changes here.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session

# Ensure built-in analyzers are registered on import.
import app.services.signal_engine.analyzers  # noqa: F401,E402  (registration side effect)
from app.core.logging import get_logger
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.repositories.company import CompanyRepository
from app.repositories.lead import LeadRepository
from app.repositories.opportunity import OpportunityRepository
from app.repositories.signal import SignalRepository
from app.schemas.signal import SignalWebhookIn
from app.services.signal_engine.analyzers import get_analyzers
from app.services.signal_engine.analyzers.base import AnalysisResult

logger = get_logger(__name__)


@dataclass(slots=True)
class IngestOutcome:
    """Result of an ingestion run, returned to the API layer."""

    signal: Signal
    opportunity: Opportunity | None
    analyzers_applied: list[str]
    deduplicated: bool = False


class SignalEngine:
    """Coordinates analyzers and persistence to turn payloads into signals.

    The engine is constructed with a database session and builds the
    repositories it needs. Injecting the session (rather than importing a global)
    keeps each request's work transactional and isolated.
    """

    def __init__(self, session: Session) -> None:
        self.session = session
        self.companies = CompanyRepository(session)
        self.leads = LeadRepository(session)
        self.signals = SignalRepository(session)
        self.opportunities = OpportunityRepository(session)

    def ingest(self, payload: SignalWebhookIn) -> IngestOutcome:
        """Process an inbound webhook payload end-to-end.

        Returns an :class:`IngestOutcome`. If a signal with the same
        ``external_id`` already exists, ingestion is short-circuited (idempotency)
        and the existing signal is returned with ``deduplicated=True``.
        """
        # 1. Idempotency guard: never double-record the same upstream event.
        if payload.external_id:
            existing = self.signals.get_by_external_id(payload.external_id)
            if existing is not None:
                logger.info("Duplicate signal ignored: %s", payload.external_id)
                return IngestOutcome(
                    signal=existing, opportunity=None, analyzers_applied=[], deduplicated=True
                )

        # 2. Entity resolution (never blocks ingestion if data is partial).
        company = self.companies.get_or_create_from_ref(payload.company)
        lead = self.leads.get_or_create_from_ref(
            payload.lead, company.id if company else None
        )

        # 3. Run applicable analyzers and aggregate their verdicts.
        applied, aggregate = self._run_analyzers(payload)

        # 4. Persist the signal with the aggregated classification + analysis.
        signal = Signal(
            company_id=company.id if company else None,
            lead_id=lead.id if lead else None,
            signal_type=aggregate.signal_type,
            source=payload.source,
            title=payload.title,
            description=payload.description,
            external_id=payload.external_id,
            score=aggregate.score,
            confidence=aggregate.confidence,
            detected_at=payload.detected_at or None,  # model default fills if None
            raw_payload=payload.model_dump(mode="json"),
            analysis={
                "tags": aggregate.tags,
                "analyzers": applied,
                **aggregate.metadata,
            },
        )
        # ``detected_at`` uses the model default when the payload omits it.
        if payload.detected_at is not None:
            signal.detected_at = payload.detected_at
        signal = self.signals.add(signal)

        # 5. Materialize an opportunity when a strategy was proposed.
        opportunity: Opportunity | None = None
        if aggregate.strategy is not None:
            opportunity = self._create_opportunity(signal, aggregate)

        # Commit the whole unit of work atomically.
        self.session.commit()
        self.session.refresh(signal)
        if opportunity is not None:
            self.session.refresh(opportunity)

        logger.info(
            "Ingested signal %s (type=%s score=%.1f analyzers=%s opportunity=%s)",
            signal.id,
            signal.signal_type,
            signal.score,
            applied,
            opportunity.id if opportunity else None,
        )
        return IngestOutcome(
            signal=signal, opportunity=opportunity, analyzers_applied=applied
        )

    def _run_analyzers(
        self, payload: SignalWebhookIn
    ) -> tuple[list[str], AnalysisResult]:
        """Execute all supporting analyzers and merge their results.

        Aggregation rules:
        * classification/type is taken from the highest-scoring analyzer;
        * the final score is the maximum score across analyzers (a single strong
          trigger should dominate);
        * confidence is the max as well; tags are unioned;
        * the strategy from the highest-scoring analyzer that proposes one wins.

        An individual analyzer failing must never take down ingestion, so each is
        guarded — resilience is a first-class concern for an integration surface.
        """
        results: list[tuple[str, AnalysisResult]] = []
        for analyzer in get_analyzers():
            try:
                if not analyzer.supports(payload):
                    continue
                results.append((analyzer.name, analyzer.analyze(payload)))
            except Exception:  # noqa: BLE001 - isolate faulty analyzers
                logger.exception("Analyzer '%s' failed; skipping.", analyzer.name)

        applied = [name for name, _ in results]

        if not results:
            # Should not happen (the fallback always applies) but stay safe.
            return applied, AnalysisResult()

        # Best (highest-scoring) analyzer drives classification and strategy.
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

    def _create_opportunity(
        self, signal: Signal, aggregate: AnalysisResult
    ) -> Opportunity:
        """Build and persist an opportunity from a signal + proposed strategy."""
        opportunity = Opportunity(
            signal_id=signal.id,
            lead_id=signal.lead_id,
            company_id=signal.company_id,
            title=f"Opportunity: {signal.title}",
            score=signal.score,
            strategy=aggregate.strategy or {},
        )
        return self.opportunities.add(opportunity)
