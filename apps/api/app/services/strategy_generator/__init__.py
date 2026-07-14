"""Strategy Generator service package.

The second intelligence layer of BEE: turns a classified signal into a complete
CEO battlecard (pain_point · closing_argument · timing_window).

Generator priority chain (highest wins)
----------------------------------------
1. LLMStrategyGenerator (priority=1000) — GPT-4o / Claude 3.5 Sonnet
   Active when AI_PROVIDER=openai|anthropic and AI_API_KEY is set.
2. RuleBasedStrategyGenerator (priority=0) — deterministic templates
   Always active; serves as the fallback when LLM is disabled or fails.
"""

from app.services.strategy_generator.base import EnrichmentContext, StrategyGenerator
from app.services.strategy_generator.registry import (
    get_strategy_generators,
    register_strategy_generator,
)
from app.services.strategy_generator.service import StrategyGeneratorService

__all__ = [
    "EnrichmentContext",
    "StrategyGenerator",
    "StrategyGeneratorService",
    "get_strategy_generators",
    "register_strategy_generator",
]
