"""Strategy generator plugin registry.

Mirror of the signal-analyzer registry pattern. Generators register themselves
via ``@register_strategy_generator`` and the service discovers them through
``get_strategy_generators``. Adding a new generator (LLM or otherwise) is a
single decorator — no wiring changes elsewhere.
"""

from __future__ import annotations

from app.core.logging import get_logger
from app.services.strategy_generator.base import StrategyGenerator

logger = get_logger(__name__)

_REGISTRY: dict[str, StrategyGenerator] = {}


def register_strategy_generator(cls: type[StrategyGenerator]) -> type[StrategyGenerator]:
    """Class decorator that instantiates and registers a strategy generator.

    Usage::

        @register_strategy_generator
        class MyGenerator(StrategyGenerator):
            name = "my_generator"
            ...
    """
    instance = cls()
    if not instance.name or instance.name == "base":
        raise ValueError(f"StrategyGenerator {cls.__name__} must define a unique 'name'.")
    _REGISTRY[instance.name] = instance
    logger.debug("Registered strategy generator: %s", instance.name)
    return cls


def get_strategy_generators() -> list[StrategyGenerator]:
    """Return all registered generators ordered by descending priority."""
    return sorted(_REGISTRY.values(), key=lambda g: g.priority, reverse=True)


def clear_registry() -> None:
    """Remove all registered generators (primarily for tests)."""
    _REGISTRY.clear()
