"""StrategyGenerator abstractions.

The StrategyGenerator is the second extension point of BEE — separate from the
SignalAnalyzer registry. While signal analyzers classify *what happened*, strategy
generators answer *what to do about it*: they synthesize the pain point, the
closing argument, and the timing window from the classified signal context.

Separation of concerns
-----------------------
* Signal analyzers: raw payload → classification (signal_type, score, tags)
* Strategy generators: classification + context → sales strategy (battlecard)

The two registries are independent. You can upgrade your strategy engine to an LLM
(by adding an ``LLMStrategyGenerator``) without touching the signal classifiers, and
vice versa. The ``SignalEngine`` depends only on the ``StrategyGeneratorService``
interface — it never knows which generator runs.

Adding an LLM generator
------------------------
::

    from app.services.strategy_generator.base import EnrichmentContext, StrategyGenerator
    from app.services.strategy_generator.registry import register_strategy_generator
    from app.schemas.strategy import StrategySchema, TimingWindow

    @register_strategy_generator
    class GPT4StrategyGenerator(StrategyGenerator):
        name = "gpt-4o"
        priority = 1000  # highest priority — runs before rule-based

        def supports(self, ctx: EnrichmentContext) -> bool:
            return True  # let the LLM handle everything

        def generate(self, ctx: EnrichmentContext) -> StrategySchema:
            prompt = build_prompt(ctx)          # format the context
            response = call_openai(prompt)       # stream / parse response
            return parse_strategy(response)      # map to StrategySchema
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.models.base import SignalType

if TYPE_CHECKING:
    from app.schemas.feedback import SuccessHint
    from app.schemas.insights import MarketInsightRef
    from app.schemas.network import IntroPath
    from app.schemas.variants import ActiveVariantRef


@dataclass(slots=True)
class EnrichmentContext:
    """All context a strategy generator needs to produce a battlecard.

    Deliberately a plain dataclass — decoupled from the ORM so generators are
    testable with no database and promptable without SQLAlchemy objects.

    Attribute contract for LLM prompts
    ------------------------------------
    Every field maps to an LLM prompt variable. When building a GPT-4o generator,
    format the system prompt with these fields and parse the response into a
    :class:`~app.schemas.strategy.StrategySchema`.

    ``success_hints`` is the adaptive memory input: ranked patterns from closed
    deals that tell the generator "for this kind of signal, email + this playbook
    wins 74% of the time." Rule-based generators check hints to bias their output;
    LLM generators insert them verbatim into the system prompt.
    """

    # ── Signal classification (from the SignalAnalyzer layer) ────────────────
    signal_type: SignalType
    signal_title: str
    signal_score: float
    signal_description: str | None = None

    # ── Entity context (resolved by the engine) ──────────────────────────────
    company_name: str | None = None
    company_domain: str | None = None
    company_industry: str | None = None
    company_country: str | None = None

    lead_name: str | None = None
    lead_title: str | None = None
    lead_email: str | None = None
    lead_seniority: str | None = None

    # ── Raw payload (preserved for LLM prompts that need unstructured text) ──
    raw_payload: dict[str, Any] = field(default_factory=dict)

    # ── Analyzer metadata (tags, primary analyzer, etc.) ─────────────────────
    analysis_tags: list[str] = field(default_factory=list)
    primary_analyzer: str | None = None

    # ── Adaptive memory: learned success patterns from closed deals ───────────
    # Injected by StrategyGeneratorService after querying FeedbackLoopService.
    # Empty list = no historical data yet; generators use their default logic.
    success_hints: list[SuccessHint] = field(default_factory=list)

    # ── Market intelligence: macro patterns from TrendAnalyst ────────────────
    # Fresh MarketInsights for this signal type and industry. Generators can
    # use these to adjust urgency or add sector context to the closing argument.
    market_insights: list[MarketInsightRef] = field(default_factory=list)

    # ── A/B variant: active experiment arm assignment ─────────────────────────
    # When a TacticVariant is active for this signal type, this ref contains
    # the assigned arm ("a" or "b") and its config overrides (channel, playbook).
    # Generators apply these overrides to support controlled A/B experiments.
    active_variant: ActiveVariantRef | None = None

    # ── Psychographic profile: DISC communication style ───────────────────────
    # The lead's DISC dominant style (D/I/S/C) and content preferences.
    # Injected by StrategyGeneratorService after querying PsychographicAnalyzer.
    # Used by generators to adjust recommended channel, message tone, and
    # the ContentStyleMiddleware adapts all generated text accordingly.
    psychographic_style: str | None = None  # "D" | "I" | "S" | "C" | None
    psychographic_tone: str | None = None   # "direct" | "enthusiastic" | "warm" | "analytical"

    # ── Network intelligence: warm intro paths ────────────────────────────────
    # Introduction paths from CEO's network to the target company.
    # Injected by StrategyGeneratorService after querying NetworkNavigator.
    # Generators use this to adjust the recommended channel:
    #   - If warm intro path exists → recommend warm_intro channel
    #   - If no path → fall back to cold email with dark funnel personalisation
    intro_paths: list[IntroPath] = field(default_factory=list)

    # ── Dark funnel: research intensity from DarkFunnelService ────────────────
    # 0-100 score indicating how actively the company is researching solutions.
    # High score → recommend immediate outreach; low → nurture first.
    dark_funnel_score: float | None = None
    dark_funnel_stage: str | None = None  # buying_stage from HotLeadScore

    # ── VectorKnowledgeBase: similar winning strategies (Sales DNA) ───────────
    # Semantically similar past WON strategies retrieved from the vector store.
    # Each item is a dict with keys: content, score, playbook, channel, industry.
    # Rule-based generators use these to bias channel/playbook selection.
    # LLM generators inject them verbatim as few-shot examples in the system prompt.
    # Empty list = no similar wins yet; generators use their default logic.
    similar_wins: list[dict] = field(default_factory=list)

    # ── External enrichment: LinkedIn / G2 / Google (ExternalAPIOrchestrator) ─
    # Populated from signal.raw_payload["external_enrichment"] after the async
    # ingestion worker fetches lead profiles and intent signals.
    external_profile: dict[str, Any] = field(default_factory=dict)
    external_intent_keywords: list[str] = field(default_factory=list)
    external_providers_called: list[str] = field(default_factory=list)

    @property
    def best_hint(self) -> SuccessHint | None:
        """Return the highest win-rate actionable hint, or None."""
        actionable = [h for h in self.success_hints if h.is_actionable]
        return actionable[0] if actionable else None

    @property
    def has_warm_intro(self) -> bool:
        """Return True if at least one warm intro path exists."""
        return bool(self.intro_paths)

    @property
    def best_intro_path(self) -> IntroPath | None:
        """Return the highest-scored intro path, or None."""
        if not self.intro_paths:
            return None
        return max(self.intro_paths, key=lambda p: p.strength_score)

    @property
    def is_dark_funnel_hot(self) -> bool:
        """Return True if the dark funnel score indicates a hot/ready-to-buy lead."""
        return (self.dark_funnel_score or 0) >= 50

    @property
    def top_market_insight(self) -> MarketInsightRef | None:
        """Return the highest-confidence fresh market insight, if any."""
        if not self.market_insights:
            return None
        return max(self.market_insights, key=lambda i: i.confidence)


class StrategyGenerator(ABC):
    """Base class every strategy generator must implement.

    A generator inspects an :class:`EnrichmentContext` and, when it supports the
    context, returns a fully populated :class:`~app.schemas.strategy.StrategySchema`.

    Keep implementations focused: each generator owns exactly one strategy of
    generation (rule-based templates, a specific LLM, a prompt variant, etc.).
    """

    #: Unique identifier, used in logs and in ``strategy.generator``.
    name: str = "base"

    #: Higher priority generators run first and, when they return a complete
    #: strategy, suppress lower-priority generators.
    priority: int = 0

    @abstractmethod
    def supports(self, ctx: EnrichmentContext) -> bool:
        """Return True if this generator can handle the given context.

        Should be fast and side-effect free.
        """
        raise NotImplementedError

    @abstractmethod
    def generate(self, ctx: EnrichmentContext) -> StrategySchema:  # noqa: F821
        """Produce a complete :class:`~app.schemas.strategy.StrategySchema`."""
        raise NotImplementedError
