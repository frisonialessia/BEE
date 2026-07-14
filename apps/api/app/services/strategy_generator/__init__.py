"""Strategy Generator service package.

The second intelligence layer of BEE: turns a classified signal into a complete
CEO battlecard (pain_point · closing_argument · timing_window).
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
