"""StrategyGeneratorService — the battlecard enrichment orchestrator.

This service is the boundary between the Signal Engine and the strategy
intelligence layer. The engine calls ``enrich(signal, opportunity)`` and
doesn't know — or care — how the strategy is produced.

Responsibilities
----------------
1. Build an :class:`~app.services.strategy_generator.base.EnrichmentContext`
   from the persisted signal (and optional company/lead relations if loaded).
2. Find the highest-priority generator that supports the context and run it.
3. Validate the output is a complete battlecard (all three mandatory fields
   populated).
4. Write the enriched strategy back to the ``Opportunity`` row.
5. Promote the opportunity to ``READY_TO_ACTION`` iff enrichment succeeded.

Failure isolation: if every generator fails, the service logs the exception,
leaves the opportunity at ``DETECTED``, and returns ``False``. Ingestion is
never aborted by a strategy error.
"""

from __future__ import annotations

from sqlmodel import Session

# Triggers registration of all built-in generators as a side effect.
import app.services.strategy_generator.rule_based  # noqa: F401,E402
from app.core.logging import get_logger
from app.models.base import OpportunityStatus, SignalType
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.schemas.strategy import StrategySchema
from app.services.strategy_generator.base import EnrichmentContext
from app.services.strategy_generator.registry import get_strategy_generators

logger = get_logger(__name__)


class StrategyGeneratorService:
    """Orchestrates strategy generation and writes the result to the DB.

    Injected into the :class:`~app.services.signal_engine.engine.SignalEngine`
    via the constructor, so the engine's interface never changes when the
    strategy layer evolves.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def enrich(self, signal: Signal, opportunity: Opportunity) -> bool:
        """Generate and persist a battlecard strategy for the opportunity.

        Returns ``True`` when the opportunity is promoted to ``READY_TO_ACTION``,
        ``False`` when enrichment fails or produces an incomplete strategy.
        """
        ctx = self._build_context(signal)
        strategy = self._run_generators(ctx)
        if strategy is None:
            logger.warning(
                "No strategy generated for opportunity %s; stays DETECTED.", opportunity.id
            )
            return False

        if not strategy.is_battlecard_complete():
            logger.warning(
                "Strategy for opportunity %s is incomplete; stays DETECTED.", opportunity.id
            )
            return False

        opportunity.strategy = strategy.to_db_dict()
        opportunity.status = OpportunityStatus.READY_TO_ACTION
        self.session.add(opportunity)
        logger.info(
            "Opportunity %s enriched → READY_TO_ACTION (generator=%s)",
            opportunity.id,
            strategy.generator,
        )
        return True

    def _build_context(self, signal: Signal) -> EnrichmentContext:
        """Assemble an :class:`EnrichmentContext` from a persisted signal.

        Pulls entity data from the signal's own FK columns and from the raw
        payload (preserved at ingestion time), so the context is always
        reconstructable even if company/lead rows change later.
        """
        raw = signal.raw_payload or {}
        company_ref = raw.get("company") or {}
        lead_ref = raw.get("lead") or {}
        analysis = signal.analysis or {}

        return EnrichmentContext(
            signal_type=signal.signal_type if isinstance(signal.signal_type, SignalType) else SignalType(signal.signal_type),
            signal_title=signal.title,
            signal_score=signal.score,
            signal_description=signal.description,
            company_name=company_ref.get("name"),
            company_domain=company_ref.get("domain"),
            company_industry=company_ref.get("industry"),
            company_country=company_ref.get("country"),
            lead_name=lead_ref.get("full_name"),
            lead_title=lead_ref.get("title"),
            lead_email=lead_ref.get("email"),
            lead_seniority=lead_ref.get("seniority"),
            raw_payload=raw,
            analysis_tags=analysis.get("tags", []),
            primary_analyzer=analysis.get("primary_analyzer"),
        )

    def _run_generators(self, ctx: EnrichmentContext) -> StrategySchema | None:
        """Execute generators in priority order; return the first successful result.

        The highest-priority generator that ``supports`` the context and produces
        a valid ``StrategySchema`` wins. Subsequent generators are skipped (the
        "chain of responsibility" pattern). This lets an LLM generator at
        ``priority=1000`` silently take over from the rule-based ones.
        """
        for generator in get_strategy_generators():
            try:
                if not generator.supports(ctx):
                    continue
                strategy = generator.generate(ctx)
                logger.debug(
                    "Generator '%s' produced strategy for signal_type=%s",
                    generator.name,
                    ctx.signal_type,
                )
                return strategy
            except Exception:  # noqa: BLE001 - isolate faulty generators
                logger.exception(
                    "Strategy generator '%s' failed; trying next.", generator.name
                )

        return None
