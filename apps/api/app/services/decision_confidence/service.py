"""DecisionConfidenceService — AI confidence scoring and manual review flagging.

Formerly ``DecisionConfidenceService`` — renamed because it collides with actual
infra observability (tracing/metrics, see ``app.core.otel``) in a way that
misleads anyone asking "does BEE have observability?" This module has
nothing to do with tracing a request through the system; it scores how
much BEE itself trusts a *decision* it just made.

Every strategy that BEE generates gets a ``confidence_score`` (0-1) that
quantifies how reliable the battlecard is. When confidence falls below 0.80,
the system sets ``manual_review_required = True`` and the CEO sees a warning
badge on the battlecard before any action is permitted.

How confidence is calculated
-----------------------------
The score is a weighted combination of signals (weights as actually
implemented in ``_compute_score`` below):

* **Generator reliability** (50% weight): rule-based generators are
  deterministic but templated (0.85); future LLM generators derive their
  score from model uncertainty / perplexity metrics.

* **Battlecard completeness** (35% weight): all three CEO fields must be
  non-empty and of meaningful length. Short or missing fields reduce confidence.

* **Hint alignment** (8% weight): when the chosen channel/playbook matches
  the top success hint, confidence increases slightly — historical data
  corroborates the recommendation.

* **Market insight support** (7% weight): when an active market insight
  supports this signal type and industry, confidence increases.

LLM integration path
---------------------
When GPT-4o or Claude is added as a generator, it should set
``strategy.confidence_score`` from its own uncertainty estimate (e.g. logprob
of the generated JSON). This module then applies a floor/ceiling and adds the
completeness/hint terms on top.
"""

from __future__ import annotations

from app.schemas.feedback import SuccessHint
from app.schemas.insights import MarketInsightRef
from app.schemas.strategy import StrategySchema

CONFIDENCE_THRESHOLD = 0.80  # below this, manual review is required

# Per-generator base reliability scores (floor value before other adjustments)
GENERATOR_BASE_SCORES: dict[str, float] = {
    "rule_based": 0.85,
    "funding_strategy": 0.85,
    "hiring_strategy": 0.80,
    "tech_adoption_strategy": 0.78,
    "generic_strategy": 0.55,  # catch-all is inherently less precise
    "rule_based_default": 0.75,
}
DEFAULT_GENERATOR_SCORE = 0.80


class DecisionConfidenceService:
    """Scores strategy confidence and sets manual review flags.

    Stateless — no DB dependency. Called by ``StrategyGeneratorService``
    immediately after a strategy is generated, before writing to the DB.
    """

    def score_and_flag(
        self,
        strategy: StrategySchema,
        *,
        generator_name: str = "rule_based",
        success_hints: list[SuccessHint] | None = None,
        market_insights: list[MarketInsightRef] | None = None,
        cautionary_patterns: list[dict] | None = None,
    ) -> StrategySchema:
        """Compute confidence_score and set manual_review_required on the strategy.

        Returns the mutated strategy (field values updated in-place).

        ``cautionary_patterns`` is the code-level backstop for BEE's "never
        treat a loss as a recipe" guardrail: if the strategy's final
        ``(channel, playbook)`` matches a real documented loss closely
        enough, ``manual_review_required`` is forced to ``True`` regardless
        of the computed confidence score. This catches the case every
        upstream guardrail (the rule-based priority chain in
        ``rule_based.py``, the LLM system prompt) is designed to prevent but
        cannot fully guarantee for a generator that ignores its context —
        the CEO always sees a warning badge before acting on a battlecard
        that repeats a known loss.
        """
        score = self._compute_score(
            strategy=strategy,
            generator_name=generator_name,
            success_hints=success_hints or [],
            market_insights=market_insights or [],
        )

        strategy.confidence_score = round(min(1.0, max(0.0, score)), 3)
        cautioned = self._matches_cautionary_pattern(strategy, cautionary_patterns or [])
        strategy.manual_review_required = (
            strategy.confidence_score < CONFIDENCE_THRESHOLD or cautioned
        )
        return strategy

    @staticmethod
    def _matches_cautionary_pattern(
        strategy: StrategySchema, cautionary_patterns: list[dict]
    ) -> bool:
        """True when the strategy repeats a real documented loss closely enough to matter.

        Same 0.40 similarity bar ``rule_based.py`` uses to trust a positive
        similar-win match — a cautionary match is held to the same
        evidentiary standard before it forces a human into the loop.
        """
        return any(
            p.get("similarity_score", 0.0) >= 0.40  # noqa: PLR2004
            and p.get("channel") == strategy.channel
            and p.get("playbook") == strategy.playbook
            for p in cautionary_patterns
        )

    def _compute_score(
        self,
        strategy: StrategySchema,
        generator_name: str,
        success_hints: list[SuccessHint],
        market_insights: list[MarketInsightRef],
    ) -> float:
        # 1. Generator reliability (50%): primary trust signal
        base = GENERATOR_BASE_SCORES.get(generator_name, DEFAULT_GENERATOR_SCORE)
        generator_term = base * 0.50

        # 2. Battlecard completeness (35%): are all CEO fields populated and substantial?
        completeness = self._completeness_score(strategy)
        completeness_term = completeness * 0.35

        # 3. Hint alignment (8%): bonus when historical data corroborates the choice
        # Only penalizes when hints exist and are misaligned; neutral when no hints.
        hint_score = self._hint_alignment_score(strategy, success_hints) if success_hints else 0.85
        hint_term = hint_score * 0.08

        # 4. Market insight support (7%): bonus when market context supports acting now
        insight_score = self._insight_support_score(market_insights) if market_insights else 0.85
        insight_term = insight_score * 0.07

        return generator_term + completeness_term + hint_term + insight_term

    def _completeness_score(self, strategy: StrategySchema) -> float:
        """Score 0-1 based on presence and length of mandatory fields."""
        fields = [strategy.pain_point, strategy.closing_argument, strategy.timing_window.reason]
        scores = []
        for field_value in fields:
            if not field_value:
                scores.append(0.0)
            elif len(field_value) < 30:
                scores.append(0.4)  # too short — likely a stub
            elif len(field_value) < 80:
                scores.append(0.7)
            else:
                scores.append(1.0)
        return sum(scores) / len(scores)

    def _hint_alignment_score(self, strategy: StrategySchema, hints: list[SuccessHint]) -> float:
        """Score 0-1: does the strategy's channel/playbook match the best hint?"""
        if not hints:
            return 0.5  # no data = neutral
        best = next((h for h in hints if h.is_actionable), None)
        if best is None:
            return 0.5
        channel_match = strategy.channel == best.channel
        playbook_match = strategy.playbook == best.playbook
        if channel_match and playbook_match:
            return min(1.0, 0.7 + best.win_rate * 0.3)
        if channel_match or playbook_match:
            return 0.65
        return 0.4  # misaligned with historical evidence

    def _insight_support_score(self, insights: list[MarketInsightRef]) -> float:
        """Score 0-1: do active market insights support acting on this signal type?"""
        if not insights:
            return 0.5  # no market context = neutral
        # Average confidence of supporting insights
        return min(1.0, sum(i.confidence for i in insights) / len(insights))
