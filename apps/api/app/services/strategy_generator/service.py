"""StrategyGeneratorService — the battlecard enrichment orchestrator.

This service is the boundary between the Signal Engine and the strategy
intelligence layer. The engine calls ``enrich(signal, opportunity)`` and
doesn't know — or care — how the strategy is produced.

Responsibilities
----------------
1. Query :class:`~app.services.feedback_loop.FeedbackLoopService` for historical
   success patterns matching this signal type and company context.
2. Build an :class:`~app.services.strategy_generator.base.EnrichmentContext`
   injected with those patterns as ``success_hints``.
3. Find the highest-priority generator that supports the context and run it.
4. Validate the output is a complete battlecard.
5. Write the enriched strategy back to the ``Opportunity`` row.
6. Promote the opportunity to ``READY_TO_ACTION`` iff enrichment succeeded.

The adaptive learning loop
---------------------------
Step 1 is where BEE gets smarter over time. As more deals close (WON/LOST),
the ``FeedbackLoopService`` accumulates a richer dataset. The hints passed at
step 2 progressively converge on "what actually works for this company type
and signal combination" — without any model retraining or code changes.

Failure isolation: if every generator fails, the service logs the exception,
leaves the opportunity at ``DETECTED``, and returns ``False``.
"""

from __future__ import annotations

from sqlmodel import Session

# Triggers registration of all built-in generators as a side effect.
import app.services.strategy_generator.rule_based  # noqa: F401
from app.core.logging import get_logger
from app.models.base import OpportunityStatus, SignalType
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.schemas.strategy import StrategySchema
from app.services.feedback_loop import FeedbackLoopService
from app.services.strategy_generator.base import EnrichmentContext
from app.services.strategy_generator.registry import get_strategy_generators

logger = get_logger(__name__)


class StrategyGeneratorService:
    """Orchestrates strategy generation, injecting adaptive memory hints.

    Injected into the :class:`~app.services.signal_engine.engine.SignalEngine`
    via the constructor.
    """

    def __init__(
        self,
        session: Session,
        feedback_service: FeedbackLoopService | None = None,
    ) -> None:
        self.session = session
        # FeedbackLoopService is optional to keep tests simple and avoid
        # circular construction. When None, no historical hints are injected.
        self._feedback = feedback_service or FeedbackLoopService(session)

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
            "Opportunity %s enriched → READY_TO_ACTION (generator=%s hints=%d)",
            opportunity.id,
            strategy.generator,
            len(ctx.success_hints),
        )
        return True

    def _build_context(self, signal: Signal) -> EnrichmentContext:
        """Assemble an :class:`EnrichmentContext` enriched with adaptive hints.

        1. Pulls entity data from the raw payload.
        2. Queries FeedbackLoopService for historical success patterns.
        3. Returns a context ready for any generator to consume.
        """
        raw = signal.raw_payload or {}
        company_ref = raw.get("company") or {}
        lead_ref = raw.get("lead") or {}
        analysis = signal.analysis or {}

        signal_type = (
            signal.signal_type
            if isinstance(signal.signal_type, SignalType)
            else SignalType(signal.signal_type)
        )
        industry = company_ref.get("industry")

        # ── Adaptive memory query ────────────────────────────────────────────
        hints = self._feedback.get_success_hints(
            signal_type=signal_type.value,
            industry=industry,
        )

        return EnrichmentContext(
            signal_type=signal_type,
            signal_title=signal.title,
            signal_score=signal.score,
            signal_description=signal.description,
            company_name=company_ref.get("name"),
            company_domain=company_ref.get("domain"),
            company_industry=industry,
            company_country=company_ref.get("country"),
            lead_name=lead_ref.get("full_name"),
            lead_title=lead_ref.get("title"),
            lead_email=lead_ref.get("email"),
            lead_seniority=lead_ref.get("seniority"),
            raw_payload=raw,
            analysis_tags=analysis.get("tags", []),
            primary_analyzer=analysis.get("primary_analyzer"),
            success_hints=hints,
        )

    def _run_generators(self, ctx: EnrichmentContext) -> StrategySchema | None:
        """Execute generators in priority order; return the first successful result."""
        for generator in get_strategy_generators():
            try:
                if not generator.supports(ctx):
                    continue
                strategy = generator.generate(ctx)
                logger.debug(
                    "Generator '%s' produced strategy for signal_type=%s (hints=%d)",
                    generator.name,
                    ctx.signal_type,
                    len(ctx.success_hints),
                )
                return strategy
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Strategy generator '%s' failed; trying next.", generator.name
                )
        return None
