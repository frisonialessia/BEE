"""AuditTrailService — immutable agent decision log for full observability.

Every significant decision made by a BEE agent is recorded here as an
``AuditEntry`` snapshot. This gives the CEO (and future MLOps processes)
complete visibility into:

* What information the agent had (context_snapshot)
* What market intelligence it used (market_data_used)
* Why it made the decision (strategy_reasoning)
* What it produced (output_snapshot)
* How confident it was (confidence_score) — and whether manual review is needed

Design principles
-----------------
1. **Immutable**: Records are INSERT-only. Never UPDATE. Historical decisions
   are preserved even after data is updated downstream.

2. **Non-blocking**: ``record_decision()`` is designed to never raise. If
   audit recording fails, it logs an error but does NOT block the primary
   agent pipeline.

3. **Structured but flexible**: The core fields (agent_type, decision_type,
   context_snapshot) have fixed schemas. The ``context_snapshot``,
   ``market_data_used``, and ``output_snapshot`` fields accept any JSON so
   each agent type can log what's relevant without schema migrations.

4. **AI Observability gate**: Any entry with ``confidence_score < 0.8``
   automatically sets ``manual_review_required=True``. The CEO sees this in
   the audit trail browser and can filter to "needs review" entries.

Usage in agents
---------------
.. code-block:: python

    # In StrategyGeneratorService:
    audit = AuditTrailService(session)
    audit.record_decision(
        agent_type=AgentType.STRATEGY_GENERATOR,
        decision_type=DecisionType.STRATEGY_GENERATED,
        opportunity_id=opp.id,
        context_snapshot={
            "signal_type": ctx.signal_type,
            "psychographic_style": ctx.psychographic_style,
            "dark_funnel_score": ctx.dark_funnel_score,
            "intro_paths_count": len(ctx.intro_paths),
        },
        market_data_used={
            "success_hint_ids": [h.id for h in ctx.success_hints],
            "market_insight_ids": [m.id for m in ctx.market_insights],
        },
        strategy_reasoning=(
            f"Chose {strategy.playbook} playbook via {strategy.channel} channel. "
            f"Reasoning: DISC style={ctx.psychographic_style} → {tone} tone. "
            f"DarkFunnel score={ctx.dark_funnel_score} → {timing}."
        ),
        output_snapshot=strategy.model_dump(),
        confidence_score=strategy.confidence_score,
        generator_name=gen.name,
    )
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.audit_trail import AgentType, AuditEntry, DecisionType
from app.schemas.audit_trail import AuditSummary
from app.services.permissions import scope_by_organization_id as _scope

logger = get_logger(__name__)

_CONFIDENCE_THRESHOLD = 0.8   # Below this → manual_review_required = True


class AuditTrailService:
    """Records and queries agent decision snapshots."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Recording ─────────────────────────────────────────────────────────────

    def record_decision(
        self,
        agent_type: str,
        decision_type: str,
        *,
        context_snapshot: dict[str, Any] | None = None,
        market_data_used: dict[str, Any] | None = None,
        strategy_reasoning: str | None = None,
        output_snapshot: dict[str, Any] | None = None,
        confidence_score: float = 1.0,
        opportunity_id: uuid.UUID | None = None,
        lead_id: uuid.UUID | None = None,
        signal_id: uuid.UUID | None = None,
        pending_action_id: uuid.UUID | None = None,
        session_id: str | None = None,
        generator_name: str | None = None,
        generator_version: str | None = None,
        processing_ms: int | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> AuditEntry | None:
        """Record an agent decision. Non-blocking — never raises on failure.

        ``organization_id`` is optional and, today, only passed by a handful
        of callers that already have tenant context in scope (e.g.
        CorrectionLearningService) — most internal agent-to-agent decision
        logging doesn't yet thread it through, so the majority of entries
        stay untagged (globally visible, same as before this field existed)
        until each caller is migrated.

        Returns:
            The persisted ``AuditEntry``, or ``None`` if recording failed.
        """
        try:
            clamped_confidence = max(0.0, min(1.0, float(confidence_score)))
            entry = AuditEntry(
                organization_id=organization_id,
                agent_type=agent_type,
                decision_type=decision_type,
                session_id=session_id,
                opportunity_id=opportunity_id,
                lead_id=lead_id,
                signal_id=signal_id,
                pending_action_id=pending_action_id,
                context_snapshot=context_snapshot or {},
                market_data_used=market_data_used or {},
                strategy_reasoning=strategy_reasoning,
                output_snapshot=output_snapshot or {},
                confidence_score=clamped_confidence,
                manual_review_required=clamped_confidence < _CONFIDENCE_THRESHOLD,
                processing_ms=processing_ms,
                generator_name=generator_name,
                generator_version=generator_version,
            )
            self.session.add(entry)
            self.session.flush()

            if entry.manual_review_required:
                logger.warning(
                    "AUDIT: low confidence decision — agent=%s type=%s score=%.2f opp=%s → flagged for review",
                    agent_type, decision_type, clamped_confidence, opportunity_id,
                )
            else:
                logger.debug(
                    "AUDIT: decision recorded — agent=%s type=%s score=%.2f id=%s",
                    agent_type, decision_type, clamped_confidence, entry.id,
                )
            return entry
        except Exception:  # noqa: BLE001
            logger.exception("AUDIT: failed to record decision — agent=%s type=%s", agent_type, decision_type)
            return None

    def record_timed(
        self,
        agent_type: str,
        decision_type: str,
        start_time: float,
        **kwargs: Any,
    ) -> AuditEntry | None:
        """Convenience wrapper that auto-computes processing_ms.

        Usage::

            t0 = time.monotonic()
            result = do_something()
            audit.record_timed(AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED,
                               start_time=t0, output_snapshot=result)
        """
        processing_ms = int((time.monotonic() - start_time) * 1000)
        return self.record_decision(
            agent_type=agent_type,
            decision_type=decision_type,
            processing_ms=processing_ms,
            **kwargs,
        )

    # ── Queries ───────────────────────────────────────────────────────────────

    def get_entry(self, entry_id: uuid.UUID, organization_id: uuid.UUID | None = None) -> AuditEntry | None:
        entry = self.session.get(AuditEntry, entry_id)
        if entry is None:
            return None
        if (
            organization_id is not None
            and entry.organization_id is not None
            and entry.organization_id != organization_id
        ):
            return None
        return entry

    def list_entries(
        self,
        agent_type: str | None = None,
        decision_type: str | None = None,
        opportunity_id: uuid.UUID | None = None,
        lead_id: uuid.UUID | None = None,
        manual_review_required: bool | None = None,
        session_id: str | None = None,
        limit: int = 50,
        organization_id: uuid.UUID | None = None,
    ) -> list[AuditEntry]:
        stmt = select(AuditEntry).order_by(AuditEntry.created_at.desc()).limit(limit)
        if agent_type:
            stmt = stmt.where(AuditEntry.agent_type == agent_type)
        if decision_type:
            stmt = stmt.where(AuditEntry.decision_type == decision_type)
        if opportunity_id:
            stmt = stmt.where(AuditEntry.opportunity_id == opportunity_id)
        if lead_id:
            stmt = stmt.where(AuditEntry.lead_id == lead_id)
        if manual_review_required is not None:
            stmt = stmt.where(AuditEntry.manual_review_required == manual_review_required)
        if session_id:
            stmt = stmt.where(AuditEntry.session_id == session_id)
        stmt = _scope(stmt, AuditEntry.organization_id, organization_id)
        return list(self.session.exec(stmt).all())

    def get_decisions_for_opportunity(
        self, opportunity_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> list[AuditEntry]:
        """Return the full decision chain for an opportunity, chronological order."""
        stmt = (
            select(AuditEntry)
            .where(AuditEntry.opportunity_id == opportunity_id)
            .order_by(AuditEntry.created_at.asc())
        )
        stmt = _scope(stmt, AuditEntry.organization_id, organization_id)
        return list(self.session.exec(stmt).all())

    def count_manual_review_needed(self, organization_id: uuid.UUID | None = None) -> int:
        stmt = _scope(
            select(AuditEntry).where(AuditEntry.manual_review_required),
            AuditEntry.organization_id,
            organization_id,
        )
        entries = self.session.exec(stmt).all()
        return len(list(entries))

    def get_summary(self, organization_id: uuid.UUID | None = None) -> AuditSummary:
        stmt = _scope(select(AuditEntry), AuditEntry.organization_id, organization_id)
        all_entries = list(self.session.exec(stmt).all())

        agent_counts: dict[str, int] = {}
        decision_counts: dict[str, int] = {}
        for e in all_entries:
            agent_counts[e.agent_type] = agent_counts.get(e.agent_type, 0) + 1
            decision_counts[e.decision_type] = decision_counts.get(e.decision_type, 0) + 1

        avg_confidence = (
            sum(e.confidence_score for e in all_entries) / len(all_entries)
            if all_entries else 0.0
        )

        return AuditSummary(
            total_entries=len(all_entries),
            manual_review_count=sum(1 for e in all_entries if e.manual_review_required),
            avg_confidence_score=round(avg_confidence, 3),
            entries_by_agent=agent_counts,
            entries_by_decision=decision_counts,
        )

    # ── Convenience factory methods ───────────────────────────────────────────

    def record_strategy_generated(
        self,
        opportunity_id: uuid.UUID,
        context_snapshot: dict[str, Any],
        strategy_schema: dict[str, Any],
        confidence_score: float,
        generator_name: str,
        reasoning: str,
    ) -> AuditEntry | None:
        """Shorthand for strategy generation audit entries."""
        return self.record_decision(
            agent_type=AgentType.STRATEGY_GENERATOR,
            decision_type=DecisionType.STRATEGY_GENERATED,
            opportunity_id=opportunity_id,
            context_snapshot=context_snapshot,
            output_snapshot=strategy_schema,
            strategy_reasoning=reasoning,
            confidence_score=confidence_score,
            generator_name=generator_name,
        )

    def record_content_adapted(
        self,
        lead_id: uuid.UUID,
        original: str,
        adapted: str,
        disc_style: str,
        adaptations: list[str],
        confidence: float,
        opportunity_id: uuid.UUID | None = None,
    ) -> AuditEntry | None:
        """Shorthand for PsychographicAnalyzer content adaptation entries."""
        return self.record_decision(
            agent_type=AgentType.PSYCHOGRAPHIC_ANALYZER,
            decision_type=DecisionType.CONTENT_ADAPTED,
            lead_id=lead_id,
            opportunity_id=opportunity_id,
            context_snapshot={"disc_style": disc_style, "adaptations_applied": adaptations},
            output_snapshot={"original_length": len(original), "adapted_length": len(adapted)},
            strategy_reasoning=f"DISC style={disc_style}. Adaptations: {', '.join(adaptations)}",
            confidence_score=confidence,
            generator_name="ContentStyleMiddleware",
        )

    def record_hot_lead_detected(
        self,
        company_domain: str,
        score: float,
        buying_stage: str,
        signal_count: int,
        lead_id: uuid.UUID | None = None,
    ) -> AuditEntry | None:
        """Shorthand for DarkFunnelService hot lead detection entries."""
        return self.record_decision(
            agent_type=AgentType.DARK_FUNNEL,
            decision_type=DecisionType.HOT_LEAD_DETECTED,
            lead_id=lead_id,
            context_snapshot={
                "company_domain": company_domain,
                "research_intensity_score": score,
                "buying_stage": buying_stage,
                "signal_count": signal_count,
            },
            strategy_reasoning=f"Company {company_domain} crossed hot threshold with score={score:.1f} ({buying_stage}).",
            confidence_score=min(1.0, score / 100.0),
        )

    def record_intro_path_found(
        self,
        target_domain: str,
        paths_count: int,
        best_strength: float,
        coverage: str,
        lead_id: uuid.UUID | None = None,
    ) -> AuditEntry | None:
        """Shorthand for NetworkNavigator intro path detection."""
        return self.record_decision(
            agent_type=AgentType.STRATEGY_GENERATOR,
            decision_type=DecisionType.INTRO_PATH_FOUND,
            lead_id=lead_id,
            context_snapshot={
                "target_domain": target_domain,
                "paths_found": paths_count,
                "best_strength_score": best_strength,
                "network_coverage": coverage,
            },
            strategy_reasoning=(
                f"Found {paths_count} intro path(s) to {target_domain}. "
                f"Best path strength: {best_strength:.1f}/10. Coverage: {coverage}."
            ),
            confidence_score=min(1.0, best_strength / 10.0) if paths_count > 0 else 0.0,
        )
