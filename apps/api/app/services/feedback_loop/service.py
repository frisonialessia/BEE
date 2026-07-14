"""FeedbackLoopService — BEE's adaptive memory.

This service is the learning brain of BEE. It does two things:

1. **Record**: When a sales rep closes an opportunity (WON or LOST), this
   service captures the full context — the signal type, company profile, lead
   seniority, channel, playbook, and generator version — as a ``StrategyOutcome``
   row. This builds a labeled training dataset over time.

2. **Query**: Given a new enrichment context, this service computes the
   statistically best (playbook, channel) combination for similar past deals and
   returns ``SuccessHint`` objects that the ``StrategyGeneratorService`` injects
   into the ``EnrichmentContext`` before generating the next battlecard.

The learning feedback loop
--------------------------
::

    [Rep closes WON] → record_outcome() → StrategyOutcome table
                                                   ↓
    [New signal arrives] → get_success_hints() ← Win-rate aggregation
                                   ↓
    [StrategyGeneratorService] → EnrichmentContext.success_hints
                                   ↓
    [Rule-based generator] → prefers highest win_rate playbook/channel
    [LLM generator]        → injects hint text into system prompt

Over time, as more deals are closed, the hints become statistically reliable
(``confidence = "high"``) and the system autonomously improves its battlecard
quality without any code changes.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import Session

from app.core.logging import get_logger
from app.models.base import OpportunityStatus
from app.models.opportunity import Opportunity
from app.models.strategy_outcome import StrategyOutcome
from app.repositories.opportunity import OpportunityRepository
from app.repositories.strategy_outcome import StrategyOutcomeRepository
from app.schemas.feedback import OutcomeIn, OutcomeOut, SuccessHint

logger = get_logger(__name__)

_CONFIDENCE_THRESHOLDS = (5, 20)  # (low→medium, medium→high) sample boundaries


def _confidence(n: int) -> str:
    if n < _CONFIDENCE_THRESHOLDS[0]:
        return "low"
    if n < _CONFIDENCE_THRESHOLDS[1]:
        return "medium"
    return "high"


class FeedbackLoopService:
    """Records sales outcomes and queries historical success patterns.

    Injected into ``StrategyGeneratorService`` so that the strategy layer can
    ask: 'What has worked for similar deals in the past?' before generating
    the next battlecard. The engine and endpoints never touch this service
    directly — it is strictly a dependency of the strategy layer.
    """

    def __init__(self, session: Session) -> None:
        self.session = session
        self._outcomes = StrategyOutcomeRepository(session)
        self._opps = OpportunityRepository(session)

    def record_outcome(
        self, opportunity_id: str | object, body: OutcomeIn
    ) -> OutcomeOut:
        """Persist a WON/LOST outcome for an opportunity.

        Also updates the opportunity's status in the main table and writes a
        fully denormalized ``StrategyOutcome`` for analytics.
        """
        import uuid as _uuid

        opp_id = _uuid.UUID(str(opportunity_id))
        opportunity = self._opps.get(opp_id)
        if opportunity is None:
            raise ValueError(f"Opportunity {opp_id} not found")

        # Idempotency: don't create a second outcome record.
        existing = self._outcomes.get_by_opportunity(opp_id)
        if existing is not None:
            logger.info("Outcome already recorded for opportunity %s", opp_id)
            return OutcomeOut(
                opportunity_id=opp_id,
                outcome=existing.outcome,
                closed_at=existing.closed_at,
                message="Outcome already recorded (idempotent)",
            )

        # Update opportunity status.
        new_status = (
            OpportunityStatus.WON if body.outcome == "won" else OpportunityStatus.LOST
        )
        opportunity.status = new_status
        self.session.add(opportunity)

        # Compute days_to_close from opportunity creation.
        now = datetime.now(UTC)
        created = opportunity.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        days = max(0, (now - created).days)

        # Extract strategy fields for denormalization.
        strat = opportunity.strategy or {}
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
        self.session.commit()

        logger.info(
            "Outcome recorded: opportunity=%s outcome=%s days=%d",
            opp_id, body.outcome, days,
        )
        return OutcomeOut(
            opportunity_id=opp_id,
            outcome=body.outcome,
            closed_at=now,
        )

    def get_success_hints(
        self,
        signal_type: str,
        industry: str | None = None,
        max_hints: int = 3,
    ) -> list[SuccessHint]:
        """Return ranked success hints for strategy generation.

        Called by ``StrategyGeneratorService`` before building the
        ``EnrichmentContext``. Returns an empty list when there is not enough
        historical data — generators fall back to their default logic.
        """
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
            logger.debug(
                "Found %d success hints for signal_type=%s industry=%s",
                len(hints), signal_type, industry,
            )
        return hints

    # ── Private helpers ──────────────────────────────────────────────────────

    def _extract_signal_type(self, opp: Opportunity) -> str:
        """Pull signal_type from the related signal's analysis if available."""
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
