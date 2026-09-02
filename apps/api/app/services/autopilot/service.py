"""AutopilotGuardrailService — the confidence/exclusion/forbidden-word gate
consulted by OmnichannelGateway.prepare_action() before deciding whether a
PendingAction can skip PENDING_APPROVAL.

`evaluate()` is a pure decision function: it never raises, never mutates
anything, and always returns a reasoned AutopilotDecision — the caller
decides what to do with it (OmnichannelGateway auto-approves; nothing else
in this codebase currently calls it, so today this is a fully-built,
fully-tested, dormant mechanism until a caller opts in by passing
confidence_score/organization_id to prepare_action).
"""

from __future__ import annotations

import uuid
from collections.abc import Collection
from dataclasses import dataclass
from datetime import timedelta

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.autopilot_config import AutopilotConfig
from app.models.base import OpportunityStatus, utcnow
from app.models.opportunity import Opportunity
from app.schemas.autopilot import (
    AutopilotConfigIn,
    AutopilotSimulationReport,
    AutopilotSimulationRequest,
    AutopilotSimulationSample,
)
from app.services.permissions import scope_by_organization_id

logger = get_logger(__name__)

# Opportunity.strategy is a free-form JSON document (see that model's own
# docstring); this is the one key every generator that produces a usable
# confidence score writes it under — see StrategySchema.confidence_score.
_STRATEGY_CONFIDENCE_KEY = "confidence_score"


@dataclass(slots=True)
class AutopilotDecision:
    """The verdict on one candidate action, plus the human-readable reason
    — never a bare boolean. Logged verbatim to the audit trail on approval,
    and useful for debugging a "why didn't this auto-approve" question."""

    auto_approve: bool
    reason: str


class AutopilotGuardrailService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Config CRUD ──────────────────────────────────────────────────────────

    def get_config(self, organization_id: uuid.UUID) -> AutopilotConfig | None:
        return self.session.exec(
            select(AutopilotConfig).where(AutopilotConfig.organization_id == organization_id)
        ).first()

    def create_or_update(self, organization_id: uuid.UUID, data: AutopilotConfigIn) -> AutopilotConfig:
        existing = self.get_config(organization_id)
        excluded = [str(c) for c in data.excluded_company_ids]

        if existing is not None:
            existing.enabled = data.enabled
            existing.confidence_threshold = data.confidence_threshold
            existing.excluded_company_ids = excluded
            existing.forbidden_words = data.forbidden_words
            config = existing
        else:
            config = AutopilotConfig(
                organization_id=organization_id,
                enabled=data.enabled,
                confidence_threshold=data.confidence_threshold,
                excluded_company_ids=excluded,
                forbidden_words=data.forbidden_words,
            )

        self.session.add(config)
        self.session.flush()
        self.session.refresh(config)
        logger.info(
            "AutopilotConfig saved: org=%s enabled=%s threshold=%.2f excluded=%d forbidden_words=%d",
            organization_id, config.enabled, config.confidence_threshold,
            len(config.excluded_company_ids), len(config.forbidden_words),
        )
        return config

    # ── The guardrail decision ──────────────────────────────────────────────

    def evaluate(
        self,
        organization_id: uuid.UUID | None,
        *,
        confidence_score: float | None,
        company_id: uuid.UUID | None = None,
        content: str = "",
    ) -> AutopilotDecision:
        """Never raises — any failure here must fall back to requiring human
        approval, never the reverse."""
        try:
            return self._evaluate(organization_id, confidence_score, company_id, content)
        except Exception:  # noqa: BLE001
            logger.exception("AutopilotGuardrailService.evaluate failed — defaulting to manual approval")
            return AutopilotDecision(False, "guardrail evaluation failed — defaulting to manual approval")

    def _evaluate(
        self,
        organization_id: uuid.UUID | None,
        confidence_score: float | None,
        company_id: uuid.UUID | None,
        content: str,
    ) -> AutopilotDecision:
        if organization_id is None:
            return AutopilotDecision(False, "no organization context")

        config = self.get_config(organization_id)
        if config is None or not config.enabled:
            return AutopilotDecision(False, "autopilot is not enabled for this organization")

        return self._decide(
            confidence_threshold=config.confidence_threshold,
            excluded_company_ids=config.excluded_company_ids,
            forbidden_words=config.forbidden_words,
            confidence_score=confidence_score,
            company_id=company_id,
            content=content,
        )

    @staticmethod
    def _decide(
        *,
        confidence_threshold: float,
        excluded_company_ids: Collection[str],
        forbidden_words: list[str],
        confidence_score: float | None,
        company_id: uuid.UUID | None,
        content: str,
    ) -> AutopilotDecision:
        """The actual guardrail rules, independent of where the config came
        from — a persisted :class:`AutopilotConfig` row for ``_evaluate``
        (live decisioning), or an unpersisted candidate for
        :meth:`run_simulation` (backtesting). Extracting this keeps the two
        paths provably identical: there is no second copy of the rules to
        drift out of sync.
        """
        if confidence_score is None:
            return AutopilotDecision(False, "no confidence score available for this action")

        if confidence_score < confidence_threshold:
            return AutopilotDecision(
                False,
                f"confidence {confidence_score:.2f} is below this org's threshold "
                f"({confidence_threshold:.2f})",
            )

        if company_id is not None and str(company_id) in excluded_company_ids:
            return AutopilotDecision(False, "this account is on the protected/excluded list")

        content_lower = content.lower()
        for word in forbidden_words:
            if word and word.lower() in content_lower:
                return AutopilotDecision(False, f"content contains a forbidden word ({word!r})")

        return AutopilotDecision(
            True,
            f"confidence {confidence_score:.2f} >= threshold {confidence_threshold:.2f}, "
            "account not excluded, no forbidden words matched",
        )

    # ── Guardrail Backtesting Sandbox ───────────────────────────────────────

    def run_simulation(
        self,
        organization_id: uuid.UUID,
        candidate: AutopilotSimulationRequest,
    ) -> AutopilotSimulationReport:
        """Backtest a *candidate* config against this organization's own
        history. Read-only: never persists the candidate, never touches a
        PendingAction, never sends anything — safe to call as many times as
        an org owner wants before committing to ``PUT /organizations/autopilot``.

        Answers "if I raised confidence_threshold to X today, what would
        have happened over the last N days?" with real outcomes instead of
        a guess: it replays :meth:`_decide` — the exact same rules
        ``OmnichannelGateway.prepare_action()`` uses live — against every
        Opportunity in the lookback window that has a strategy confidence
        score, then cross-references each verdict against that
        Opportunity's actual WON/LOST outcome to project auto-approval
        precision.

        Two known limitations, both inherited from what data actually
        exists rather than being sandbox artifacts:

        * Forbidden-word matching runs against ``execution_artifacts`` when
          present (the actual drafted outbound content) and against an
          empty string otherwise. An opportunity that never reached
          artifact generation could not have been blocked by a forbidden
          word in production either — nothing was ever drafted to check —
          so this is not an optimistic simplification, it mirrors reality.
        * Opportunities without a ``strategy.confidence_score`` (never
          reached ``READY_TO_ACTION``) are excluded from the replay
          entirely — evaluate() would have hit the same "no confidence
          score available" branch for them.
        """
        cutoff = utcnow() - timedelta(days=candidate.lookback_days)
        excluded = {str(c) for c in candidate.excluded_company_ids}

        statement = select(Opportunity).where(Opportunity.created_at >= cutoff)
        statement = scope_by_organization_id(
            statement, Opportunity.organization_id, organization_id
        )
        opportunities = self.session.exec(statement).all()

        samples: list[AutopilotSimulationSample] = []
        for opp in opportunities:
            confidence_score = _extract_confidence(opp.strategy)
            if confidence_score is None:
                continue

            decision = self._decide(
                confidence_threshold=candidate.confidence_threshold,
                excluded_company_ids=excluded,
                forbidden_words=candidate.forbidden_words,
                confidence_score=confidence_score,
                company_id=opp.company_id,
                content=_extract_content(opp.execution_artifacts),
            )
            samples.append(
                AutopilotSimulationSample(
                    opportunity_id=opp.id,
                    company_id=opp.company_id,
                    would_auto_approve=decision.auto_approve,
                    reason=decision.reason,
                    confidence_score=confidence_score,
                    outcome=_outcome(opp.status),
                )
            )

        report = _build_simulation_report(candidate.lookback_days, samples)
        logger.info(
            "Autopilot simulation: org=%s lookback_days=%d evaluated=%d "
            "would_auto_approve=%d (%.1f%%)",
            organization_id, candidate.lookback_days, report.evaluated_count,
            report.would_auto_approve_count, report.would_auto_approve_rate * 100,
        )
        return report


def _extract_confidence(strategy: dict) -> float | None:
    value = strategy.get(_STRATEGY_CONFIDENCE_KEY)
    return float(value) if isinstance(value, int | float) else None


def _extract_content(execution_artifacts: dict | None) -> str:
    """Best-effort flattening of whatever text the artifact bundle carries,
    for the forbidden-word check — same "look for the obvious text fields,
    don't fail if they're missing" tolerance as the rest of this replay."""
    if not execution_artifacts:
        return ""
    parts: list[str] = []
    for key in ("subject", "body", "message", "content"):
        value = execution_artifacts.get(key)
        if isinstance(value, str):
            parts.append(value)
    return " ".join(parts)


def _outcome(status: OpportunityStatus) -> str | None:
    if status == OpportunityStatus.WON:
        return "won"
    if status == OpportunityStatus.LOST:
        return "lost"
    return None


def _win_rate(won: int, lost: int) -> float | None:
    closed = won + lost
    return (won / closed) if closed > 0 else None


# Cap on AutopilotSimulationReport.samples — a full replay can be thousands
# of opportunities; this is for spot-checking, the aggregates are the verdict.
_MAX_SAMPLES = 100


def _build_simulation_report(
    lookback_days: int, samples: list[AutopilotSimulationSample]
) -> AutopilotSimulationReport:
    evaluated_count = len(samples)
    approved = [s for s in samples if s.would_auto_approve]
    reviewed = [s for s in samples if not s.would_auto_approve]

    auto_won = sum(1 for s in approved if s.outcome == "won")
    auto_lost = sum(1 for s in approved if s.outcome == "lost")
    auto_open = len(approved) - auto_won - auto_lost

    review_won = sum(1 for s in reviewed if s.outcome == "won")
    review_lost = sum(1 for s in reviewed if s.outcome == "lost")
    review_open = len(reviewed) - review_won - review_lost

    near_miss_excluded = sum(
        1
        for s in reviewed
        if "protected/excluded" in s.reason
    )

    ranked = sorted(samples, key=lambda s: s.confidence_score, reverse=True)

    return AutopilotSimulationReport(
        lookback_days=lookback_days,
        evaluated_count=evaluated_count,
        would_auto_approve_count=len(approved),
        would_auto_approve_rate=(len(approved) / evaluated_count) if evaluated_count else 0.0,
        auto_approved_won=auto_won,
        auto_approved_lost=auto_lost,
        auto_approved_still_open=auto_open,
        auto_approved_win_rate=_win_rate(auto_won, auto_lost),
        manual_review_won=review_won,
        manual_review_lost=review_lost,
        manual_review_still_open=review_open,
        manual_review_win_rate=_win_rate(review_won, review_lost),
        near_miss_excluded_count=near_miss_excluded,
        samples=ranked[:_MAX_SAMPLES],
    )
