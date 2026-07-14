"""StrategyGeneratorService — the battlecard enrichment orchestrator.

This service is the boundary between the Signal Engine and the strategy
intelligence layer. The engine calls ``enrich(signal, opportunity)`` and
doesn't know — or care — how the strategy is produced.

Responsibilities
----------------
1. Query :class:`~app.services.feedback_loop.FeedbackLoopService` for
   historical success patterns (``success_hints``) and active A/B variants.
2. Query :class:`~app.services.trend_analyst.TrendAnalyst` for fresh macro
   market insights relevant to this signal type and industry.
3. Build an :class:`~app.services.strategy_generator.base.EnrichmentContext`
   injected with all three data sources.
4. Find the highest-priority generator that supports the context and run it.
5. Score the resulting strategy via :class:`~app.services.observability.ObservabilityService`
   to set ``confidence_score`` and ``manual_review_required``.
6. Write the enriched strategy back to the ``Opportunity`` row.
7. Promote the opportunity to ``READY_TO_ACTION`` iff enrichment succeeded.

The adaptive learning loop
---------------------------
Steps 1-2 are where BEE gets smarter over time. As more deals close,
FeedbackLoopService hints improve. As more signals accumulate, TrendAnalyst
insights sharpen. Both inject themselves into every new strategy — no code
changes required.

Failure isolation: if every generator fails, the service logs the exception,
leaves the opportunity at ``DETECTED``, and returns ``False``.
"""

from __future__ import annotations

from sqlmodel import Session

import app.services.strategy_generator.rule_based  # noqa: F401
from app.core.logging import get_logger
from app.models.base import OpportunityStatus, SignalType
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.schemas.strategy import StrategySchema
from app.services.feedback_loop import FeedbackLoopService
from app.services.observability import ObservabilityService
from app.services.strategy_generator.base import EnrichmentContext
from app.services.strategy_generator.registry import get_strategy_generators

logger = get_logger(__name__)


class StrategyGeneratorService:
    """Orchestrates strategy generation with adaptive memory, market context, and observability."""

    def __init__(
        self,
        session: Session,
        feedback_service: FeedbackLoopService | None = None,
        trend_analyst: object | None = None,
    ) -> None:
        self.session = session
        self._feedback = feedback_service or FeedbackLoopService(session)
        self._observability = ObservabilityService()
        # Lazy import to avoid circular deps; pass None to disable trend injection.
        self._trend = trend_analyst

    def enrich(self, signal: Signal, opportunity: Opportunity) -> bool:
        """Generate and persist a battlecard strategy for the opportunity.

        Returns ``True`` when the opportunity is promoted to ``READY_TO_ACTION``,
        ``False`` when enrichment fails or produces an incomplete strategy.
        """
        ctx = self._build_context(signal)
        strategy = self._run_generators(ctx)
        if strategy is None:
            logger.warning("No strategy for opportunity %s; stays DETECTED.", opportunity.id)
            return False

        if not strategy.is_battlecard_complete():
            logger.warning("Strategy for opportunity %s incomplete; stays DETECTED.", opportunity.id)
            return False

        # Apply observability scoring (sets confidence_score + manual_review_required).
        strategy = self._observability.score_and_flag(
            strategy,
            generator_name=strategy.generator,
            success_hints=ctx.success_hints,
            market_insights=ctx.market_insights,
        )

        opportunity.strategy = strategy.to_db_dict()
        opportunity.status = OpportunityStatus.READY_TO_ACTION
        self.session.add(opportunity)
        logger.info(
            "Opportunity %s → READY_TO_ACTION (generator=%s hints=%d insights=%d "
            "confidence=%.2f review_required=%s)",
            opportunity.id,
            strategy.generator,
            len(ctx.success_hints),
            len(ctx.market_insights),
            strategy.confidence_score,
            strategy.manual_review_required,
        )

        # Publish event to WorkflowOrchestrator (opt-in, non-blocking)
        self._publish_ready_event(opportunity, ctx)
        return True

    def _publish_ready_event(self, opportunity: Opportunity, ctx: EnrichmentContext) -> None:
        """Publish opportunity.ready_to_action to trigger workflow handlers."""
        try:
            from app.schemas.workflow import BeeEvent
            from app.services.workflow_orchestrator.service import WorkflowOrchestrator
            event = BeeEvent(
                event_type="opportunity.ready_to_action",
                entity_id=opportunity.id,
                entity_type="opportunity",
                payload={
                    "opportunity_id": str(opportunity.id),
                    "company_name": ctx.company_name,
                    "score": opportunity.score,
                    "signal_type": ctx.signal_type.value,
                },
            )
            WorkflowOrchestrator(self.session).publish(event)
        except Exception:  # noqa: BLE001
            logger.warning("WorkflowOrchestrator publish failed for ready_to_action event.")

    def _build_context(self, signal: Signal) -> EnrichmentContext:
        """Assemble an EnrichmentContext from all intelligence sources."""
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

        # ── 1. Adaptive memory hints ──────────────────────────────────────────
        hints = self._feedback.get_success_hints(signal_type=signal_type.value, industry=industry)

        # ── 2. A/B variant assignment ─────────────────────────────────────────
        variant_ref = self._feedback.get_active_variant(signal_type=signal_type.value, industry=industry)

        # ── 3. Market insights from TrendAnalyst ──────────────────────────────
        market_insights = []
        if self._trend is not None:
            try:
                market_insights = self._trend.get_active_insights_for_context(
                    signal_type=signal_type.value,
                    industry=industry,
                )
            except Exception:  # noqa: BLE001
                logger.warning("TrendAnalyst unavailable; proceeding without market insights.")

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
            market_insights=market_insights,
            active_variant=variant_ref,
        )

    def _run_generators(self, ctx: EnrichmentContext) -> StrategySchema | None:
        """Execute generators in priority order; return the first successful result."""
        for generator in get_strategy_generators():
            try:
                if not generator.supports(ctx):
                    continue
                strategy = generator.generate(ctx)

                # Tag the strategy with the active A/B variant arm so outcomes
                # can be correctly attributed when the deal closes.
                if ctx.active_variant:
                    strategy.variant_id = str(ctx.active_variant.variant_id)
                    strategy.variant_arm = ctx.active_variant.arm

                logger.debug(
                    "Generator '%s' produced strategy (signal_type=%s hints=%d insights=%d variant=%s)",
                    generator.name,
                    ctx.signal_type,
                    len(ctx.success_hints),
                    len(ctx.market_insights),
                    ctx.active_variant.arm if ctx.active_variant else None,
                )
                return strategy
            except Exception:  # noqa: BLE001
                logger.exception("Generator '%s' failed; trying next.", generator.name)
        return None
