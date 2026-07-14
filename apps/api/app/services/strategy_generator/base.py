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
from typing import Any

from app.models.base import SignalType


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
