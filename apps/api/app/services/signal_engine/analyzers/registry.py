"""Analyzer registry.

A tiny plugin registry that decouples *defining* an analyzer from *wiring it in*.
Analyzers register themselves via the :func:`register_analyzer` decorator, and
the engine discovers them through :func:`get_analyzers`. This is the mechanism
that satisfies the requirement: "add new signal analyzers without breaking the
rest of the system".
"""

from __future__ import annotations

from app.core.logging import get_logger
from app.services.signal_engine.analyzers.base import SignalAnalyzer

logger = get_logger(__name__)

# Registry keyed by analyzer name to prevent accidental duplicates.
_REGISTRY: dict[str, SignalAnalyzer] = {}


def register_analyzer(cls: type[SignalAnalyzer]) -> type[SignalAnalyzer]:
    """Class decorator that instantiates and registers an analyzer.

    Usage::

        @register_analyzer
        class MyAnalyzer(SignalAnalyzer):
            name = "my_analyzer"
            ...

    Registration is idempotent per name: re-registering the same name replaces
    the previous instance (handy for hot-reload during development).
    """
    instance = cls()
    if not instance.name or instance.name == "base":
        raise ValueError(f"Analyzer {cls.__name__} must define a unique 'name'.")
    _REGISTRY[instance.name] = instance
    logger.debug("Registered signal analyzer: %s", instance.name)
    return cls


def get_analyzers() -> list[SignalAnalyzer]:
    """Return all registered analyzers ordered by descending priority."""
    return sorted(_REGISTRY.values(), key=lambda a: a.priority, reverse=True)


def clear_registry() -> None:
    """Remove all registered analyzers (primarily for tests)."""
    _REGISTRY.clear()
