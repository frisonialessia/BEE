"""FeedbackLoopService — BEE's adaptive memory with A/B tactic testing.

This service does three things:

1. **Record**: When an opportunity closes (WON/LOST), captures the full context
   as a ``StrategyOutcome`` row — and if an A/B variant was active, tags the
   outcome with ``variant_id`` and ``variant_arm`` so win rates can be compared
   per arm.

2. **Query hints**: Returns historical win-rate patterns as ``SuccessHint``
   objects injected into ``EnrichmentContext`` before strategy generation.

3. **A/B variant management**: Creates ``TacticVariant`` experiments, randomly
   assigns arms to new enrichments, and concludes variants when statistically
   significant differences emerge.

The learning feedback loop (now with A/B testing)
--------------------------------------------------
::

    [Rep closes WON] → record_outcome(variant_id, arm) → StrategyOutcome + VariantOutcome
                                                                   ↓
    [New signal arrives] ←── get_success_hints() ← Win-rate aggregation per arm
                         ←── get_active_variant() ← Active variant assignment
                                   ↓
    [StrategyGeneratorService] → EnrichmentContext.success_hints + active_variant
                                   ↓
    [Generator] → overrides channel/playbook from variant config
                → tags strategy with variant_id + variant_arm
                                   ↓
    [Outcome recorded] → VariantOutcome.won = True/False
                       → auto-conclude when Δ win_rate ≥ 10pp + min samples
"""

from __future__ import annotations

import random
import uuid as _uuid_module
from datetime import UTC, datetime

from sqlmodel import Session

from app.core.logging import get_logger
from app.models.base import OpportunityStatus, VariantStatus
from app.models.opportunity import Opportunity
from app.models.strategy_outcome import StrategyOutcome
from app.repositories.opportunity import OpportunityRepository
from app.repositories.strategy_outcome import StrategyOutcomeRepository
from app.repositories.tactic_variant import TacticVariantRepository
from app.schemas.feedback import OutcomeIn, OutcomeOut, SuccessHint
from app.schemas.variants import ActiveVariantRef, VariantCreateIn, VariantOut

logger = get_logger(__name__)

_CONFIDENCE_THRESHOLDS = (5, 20)


def _confidence(n: int) -> str:
    if n < _CONFIDENCE_THRESHOLDS[0]:
        return "low"
    if n < _CONFIDENCE_THRESHOLDS[1]:
        return "medium"
    return "high"


class FeedbackLoopService:
    """Records outcomes, queries patterns, and manages A/B tactic variants."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self._outcomes = StrategyOutcomeRepository(session)
        self._opps = OpportunityRepository(session)
        self._variants = TacticVariantRepository(session)

    # ── Outcome recording ─────────────────────────────────────────────────────

    def record_outcome(
        self, opportunity_id: str | object, body: OutcomeIn
    ) -> OutcomeOut:
        """Persist a WON/LOST outcome.

        Automatically tags variant outcomes if the strategy has a variant_id.
        Auto-concludes the variant if the statistical stopping criteria are met.
        """
        opp_id = _uuid_module.UUID(str(opportunity_id))
        opportunity = self._opps.get(opp_id)
        if opportunity is None:
            raise ValueError(f"Opportunity {opp_id} not found")

        existing = self._outcomes.get_by_opportunity(opp_id)
        if existing is not None:
            logger.info("Outcome already recorded for opportunity %s (idempotent)", opp_id)
            return OutcomeOut(
                opportunity_id=opp_id,
                outcome=existing.outcome,
                closed_at=existing.closed_at,
                message="Outcome already recorded (idempotent)",
            )

        new_status = (
            OpportunityStatus.WON if body.outcome == "won" else OpportunityStatus.LOST
        )
        opportunity.status = new_status
        self.session.add(opportunity)

        now = datetime.now(UTC)
        created = opportunity.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        days = max(0, (now - created).days)

        strat = opportunity.strategy or {}
        won = body.outcome == "won"

        outcome_row = StrategyOutcome(
            opportunity_id=opp_id,
            signal_id=opportunity.signal_id,
            outcome=body.outcome,
            closed_at=now,
            days_to_close=days,
            score_at_close=opportunity.score,
            signal_type=self._extract_signal_type(opportunity),
            company_industry=self._extract_industry(opportunity),
            lead_seniority=self._extract_seniority(opportunity),
            playbook=strat.get("playbook", "unknown"),
            channel=strat.get("channel", "unknown"),
            generator=strat.get("generator", "unknown"),
            generator_version=strat.get("generator_version", "0"),
            notes=body.notes,
            strategy_snapshot=strat,
        )
        self._outcomes.add(outcome_row)
        self.session.flush()

        # ── A/B variant tracking ──────────────────────────────────────────────
        variant_id_str = strat.get("variant_id")
        variant_arm = strat.get("variant_arm")
        if variant_id_str and variant_arm:
            try:
                vid = _uuid_module.UUID(variant_id_str)
                self._variants.record_outcome(vid, outcome_row.id, variant_arm, won)
                # Check if we can auto-conclude the variant
                variant = self._variants.get(vid)
                if variant and variant.status == VariantStatus.ACTIVE and variant.is_ready_to_conclude:
                    self._variants.conclude(vid)
                    winner = variant.winner_arm
                    logger.info(
                        "Variant %s auto-concluded: winner=arm_%s (a=%.0f%% b=%.0f%%)",
                        vid, winner, variant.arm_a_win_rate * 100, variant.arm_b_win_rate * 100,
                    )
            except (ValueError, Exception) as exc:
                logger.warning("Failed to record variant outcome: %s", exc)

        self.session.commit()
        logger.info("Outcome: opp=%s result=%s days=%d variant=%s", opp_id, body.outcome, days, variant_id_str)

        # ── VectorKnowledgeBase: seed Sales DNA on WON outcomes ───────────────
        # Every successful close is encoded and stored in the vector store so
        # future StrategyGeneratorService calls can retrieve similar wins as
        # few-shot examples ("what worked for deals like this one").
        if won:
            self._seed_vector_store(outcome_row)

        return OutcomeOut(
            opportunity_id=opp_id,
            outcome=body.outcome,
            closed_at=now,
        )

    # ── Success hints (adaptive memory query) ────────────────────────────────

    def get_success_hints(
        self,
        signal_type: str,
        industry: str | None = None,
        max_hints: int = 3,
    ) -> list[SuccessHint]:
        """Return ranked success hints for strategy generation."""
        rows = self._outcomes.get_win_rates(signal_type, industry=industry)
        hints: list[SuccessHint] = []
        for row in rows[:max_hints]:
            hints.append(
                SuccessHint(
                    playbook=row["playbook"],
                    channel=row["channel"],
                    generator=row["generator"],
                    win_rate=row["win_rate"],
                    sample_size=row["total"],
                    confidence=_confidence(row["total"]),  # type: ignore[arg-type]
                    avg_days_to_close=row["avg_days"],
                )
            )
        if hints:
            logger.debug("Found %d hints for signal_type=%s industry=%s", len(hints), signal_type, industry)
        return hints

    # ── A/B variant management ────────────────────────────────────────────────

    def create_variant(self, body: VariantCreateIn) -> VariantOut:
        """Create a new A/B tactic experiment."""
        from app.models.tactic_variant import TacticVariant

        variant = TacticVariant(
            name=body.name,
            description=body.description,
            hypothesis=body.hypothesis,
            signal_type=body.signal_type,
            industry=body.industry,
            arm_a_config=body.arm_a_config.model_dump(exclude_none=True),
            arm_b_config=body.arm_b_config.model_dump(exclude_none=True),
            traffic_split=body.traffic_split,
            min_samples_per_arm=body.min_samples_per_arm,
        )
        self._variants.add(variant)
        self.session.commit()
        self.session.refresh(variant)
        logger.info("Created TacticVariant %s (%s) for signal_type=%s", variant.id, body.name, body.signal_type)
        return self._to_variant_out(variant)

    def get_active_variant(
        self, signal_type: str, industry: str | None = None
    ) -> ActiveVariantRef | None:
        """Return a randomly-assigned arm for an active variant, or None.

        The arm assignment is random (not sticky per-lead) to ensure unbiased
        traffic splitting. Each new enrichment is an independent Bernoulli trial.
        """
        variant = self._variants.get_active_for_signal_type(signal_type, industry=industry)
        if variant is None:
            return None

        arm = "a" if random.random() < variant.traffic_split else "b"
        config = variant.arm_a_config if arm == "a" else variant.arm_b_config

        logger.debug("Variant %s assigned arm_%s for signal_type=%s", variant.id, arm, signal_type)
        return ActiveVariantRef(
            variant_id=variant.id,
            arm=arm,
            config=config,
        )

    def conclude_variant(self, variant_id: _uuid_module.UUID) -> VariantOut:
        """Manually conclude a variant and declare a winner."""
        variant = self._variants.conclude(variant_id)
        if variant is None:
            raise ValueError(f"Variant {variant_id} not found")
        self.session.commit()
        self.session.refresh(variant)
        return self._to_variant_out(variant)

    def list_variants(self) -> list[VariantOut]:
        return [self._to_variant_out(v) for v in self._variants.list()]

    def get_variant(self, variant_id: _uuid_module.UUID) -> VariantOut:
        variant = self._variants.get(variant_id)
        if variant is None:
            raise ValueError(f"Variant {variant_id} not found")
        return self._to_variant_out(variant)

    # ── VectorKnowledgeBase integration ───────────────────────────────────────

    def _seed_vector_store(self, outcome: StrategyOutcome) -> None:
        """Encode a WON strategy into the vector store (Sales DNA).

        The document content is a natural-language summary of the winning
        strategy — rich enough for semantic similarity search but structured
        enough to be useful as a few-shot example for LLM generators.

        Non-blocking: failures are logged but never propagate to the caller.
        """
        try:
            from app.services.vector_store import get_vector_store

            strat = outcome.strategy_snapshot or {}

            # Compose a semantic content string for embedding
            content = (
                f"SIGNAL: {outcome.signal_type or 'unknown'}. "
                f"INDUSTRY: {outcome.company_industry or 'general'}. "
                f"LEAD: {outcome.lead_seniority or 'unknown seniority'}. "
                f"PLAYBOOK: {strat.get('playbook', outcome.playbook)}. "
                f"CHANNEL: {strat.get('channel', outcome.channel)}. "
                f"PAIN: {strat.get('pain_point', '')[:150]}. "
                f"CLOSING: {strat.get('closing_argument', '')[:150]}. "
                f"RESULT: WON in {outcome.days_to_close} days. "
                f"SCORE: {outcome.score_at_close:.1f}."
            )

            store = get_vector_store()
            store.upsert(
                doc_id=f"outcome:{outcome.id}",
                content=content,
                metadata={
                    "signal_type": outcome.signal_type,
                    "industry": outcome.company_industry,
                    "playbook": outcome.playbook,
                    "channel": outcome.channel,
                    "days_to_close": outcome.days_to_close,
                    "score": outcome.score_at_close,
                    "generator": outcome.generator,
                },
            )
            logger.info(
                "VectorKnowledgeBase: seeded WON outcome %s (signal=%s industry=%s)",
                outcome.id, outcome.signal_type, outcome.company_industry,
            )
        except Exception:  # noqa: BLE001
            logger.warning("VectorKnowledgeBase seeding failed for outcome %s", outcome.id, exc_info=True)

    # ── Private helpers ────────────────────────────────────────────────────────

    def _to_variant_out(self, variant: object) -> VariantOut:
        return VariantOut.model_validate(variant)

    def _extract_signal_type(self, opp: Opportunity) -> str:
        from app.models.signal import Signal
        if opp.signal_id:
            sig = self.session.get(Signal, opp.signal_id)
            if sig:
                return str(sig.signal_type.value if hasattr(sig.signal_type, "value") else sig.signal_type)
        return "other"

    def _extract_industry(self, opp: Opportunity) -> str | None:
        from app.models.company import Company
        if opp.company_id:
            co = self.session.get(Company, opp.company_id)
            return co.industry if co else None
        return None

    def _extract_seniority(self, opp: Opportunity) -> str | None:
        from app.models.lead import Lead
        if opp.lead_id:
            lead = self.session.get(Lead, opp.lead_id)
            return lead.seniority if lead else None
        return None
