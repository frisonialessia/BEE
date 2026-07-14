"""ResourcePredictorService — operational impact assessment before WON.

Before BEE confirms an opportunity as WON, this service evaluates the
operational implications: Does the team have capacity to onboard this client?
Is the deal complexity higher than usual? Are there compliance or executive
engagement requirements?

This service is **opt-in** and **rule-based** by design:

Opt-in
------
Set ``RESOURCE_PREDICTION_ENABLED = True`` in ``.env`` to activate. When
disabled (the default), ``predict()`` returns a safe LOW-risk prediction
and the WON confirmation proceeds unimpeded.

Set ``RESOURCE_PREDICTION_STRICT = True`` to enable blocking: if the
prediction returns ``risk_level = HIGH``, the WON confirmation is rejected
with HTTP 422 and the CEO must resolve the resource conflict first.

Rule-based, LLM-ready
---------------------
All rules are defined in ``_RULES`` — a list of ``(condition, effect)``
callables. Adding a new rule = one entry in the list. When an LLM becomes
available, an ``LLMResourcePredictor`` can replace the rule engine entirely
by inheriting from the same abstract base.

Mockable
--------
``predict()`` is pure: it takes an ``Opportunity`` + related entities and
returns a ``ResourcePrediction`` dict. No I/O, no external calls.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.core.logging import get_logger
from app.models.opportunity import Opportunity
from app.schemas.predictor import ResourcePrediction

logger = get_logger(__name__)

# Risk thresholds
_HIGH_SCORE = 85.0      # high-score deals need more attention
_MEDIUM_SCORE = 60.0

# Industry clusters that historically require more complex onboarding
_COMPLEX_INDUSTRIES = {"finance", "healthcare", "insurance", "government", "legal", "banking"}
_SENIOR_LEVELS = {"c_level", "vp", "director"}


@dataclass
class PredictionContext:
    """Resolved context for a resource prediction evaluation."""

    opportunity_score: float
    signal_type: str
    industry: str | None
    lead_seniority: str | None
    lead_title: str | None
    playbook: str | None
    channel: str | None


@dataclass
class RuleEffect:
    """Impact of a rule firing."""

    impact: float  # added to capacity_impact_score (0-100 scale)
    warning: str | None = None
    action: str | None = None
    forces_high_risk: bool = False  # override risk level to HIGH


# ── Rule definitions ──────────────────────────────────────────────────────────
# Each rule is (condition: ctx → bool, effect: RuleEffect).
# Rules are evaluated in order; all matching rules accumulate.

_RULES: list[tuple[Callable[[PredictionContext], bool], RuleEffect]] = [
    # High-score deal = likely large contract, more onboarding weight
    (
        lambda ctx: ctx.opportunity_score >= _HIGH_SCORE,
        RuleEffect(
            impact=30.0,
            warning="High-value deal (score ≥ 85). Dedicated CSM assignment recommended.",
            action="Assign a dedicated Customer Success Manager within 48h of close.",
        ),
    ),
    # Medium-score deal — moderate load
    (
        lambda ctx: _MEDIUM_SCORE <= ctx.opportunity_score < _HIGH_SCORE,
        RuleEffect(impact=15.0),
    ),
    # Complex industry — compliance/legal review needed
    (
        lambda ctx: ctx.industry is not None and ctx.industry.lower() in _COMPLEX_INDUSTRIES,
        RuleEffect(
            impact=25.0,
            warning="Regulated industry detected. Legal/compliance review may be required.",
            action="Escalate to legal team for contract review before service delivery.",
            forces_high_risk=True,
        ),
    ),
    # C-level lead — executive sponsor must be assigned
    (
        lambda ctx: ctx.lead_seniority in _SENIOR_LEVELS,
        RuleEffect(
            impact=15.0,
            warning="Senior executive engagement required.",
            action="Schedule executive kickoff call with CEO/VP within first week.",
        ),
    ),
    # Funding-round signal → fast growth expected, resource spike
    (
        lambda ctx: ctx.signal_type == "funding_round",
        RuleEffect(
            impact=10.0,
            warning="Post-funding client: rapid headcount growth expected. Scale support capacity.",
            action="Provision 120% of standard onboarding capacity.",
        ),
    ),
]


def _risk_level(score: float, forces_high: bool) -> str:
    if forces_high or score >= 60:
        return "high"
    if score >= 30:
        return "medium"
    return "low"


class ResourcePredictorService:
    """Evaluates operational impact of a WON confirmation.

    Completely stateless — no DB dependency. Pass the resolved context
    directly so the service is trivially testable.
    """

    def predict(self, opportunity: Opportunity, *, context: PredictionContext | None = None) -> ResourcePrediction:
        """Run all rules against the opportunity context and return a prediction.

        Args:
            opportunity: The opportunity about to be confirmed as WON.
            context:     Optionally pre-resolved context (avoids DB lookups in tests).
        """
        ctx = context or self._resolve_context(opportunity)

        total_impact = 0.0
        warnings: list[str] = []
        actions: list[str] = []
        forces_high = False

        for condition, effect in _RULES:
            try:
                if condition(ctx):
                    total_impact += effect.impact
                    if effect.warning:
                        warnings.append(effect.warning)
                    if effect.action:
                        actions.append(effect.action)
                    if effect.forces_high_risk:
                        forces_high = True
            except Exception:  # noqa: BLE001
                logger.warning("Rule evaluation failed; skipping rule.")

        total_impact = min(100.0, total_impact)
        risk = _risk_level(total_impact, forces_high)

        summary = self._build_summary(risk, total_impact, warnings)

        logger.info(
            "ResourcePrediction: opp=%s score=%.0f risk=%s impact=%.0f warnings=%d",
            opportunity.id,
            ctx.opportunity_score,
            risk,
            total_impact,
            len(warnings),
        )

        return ResourcePrediction(
            risk_level=risk,
            capacity_impact_score=round(total_impact, 1),
            warnings=warnings,
            recommended_actions=actions,
            blocks_confirmation=False,  # set by the endpoint based on STRICT mode setting
            summary=summary,
        )

    def _resolve_context(self, opp: Opportunity) -> PredictionContext:
        """Extract prediction context from the opportunity's strategy and score."""
        strat = opp.strategy or {}
        signal_type = "other"
        industry = None
        lead_seniority = None
        lead_title = None

        # Try to resolve from strategy snapshot (avoids additional DB queries)
        if "context_snapshot" in strat:
            snap = strat["context_snapshot"]
            signal_type = snap.get("signal_type", "other")
            industry = snap.get("industry")

        return PredictionContext(
            opportunity_score=opp.score,
            signal_type=strat.get("signal_type", signal_type),
            industry=industry,
            lead_seniority=lead_seniority,
            lead_title=lead_title,
            playbook=strat.get("playbook"),
            channel=strat.get("channel"),
        )

    def _build_summary(self, risk: str, score: float, warnings: list[str]) -> str:
        if risk == "low":
            return "Low operational impact. Safe to confirm — standard onboarding applies."
        if risk == "medium":
            return (
                f"Moderate impact (score {score:.0f}/100). "
                "Review warnings before confirming WON."
            )
        return (
            f"High operational impact (score {score:.0f}/100). "
            f"{len(warnings)} concern(s) detected. "
            "Ensure resource assignments are in place before confirming."
        )
