"""Pluggable registry for ArtifactGenerators."""

from __future__ import annotations

from app.core.logging import get_logger
from app.services.executive_agent.base import ArtifactGenerator

logger = get_logger(__name__)

_REGISTRY: dict[str, ArtifactGenerator] = {}


def register_artifact_generator(cls: type[ArtifactGenerator]) -> type[ArtifactGenerator]:
    """Class decorator that registers an artifact generator.

    Usage::

        @register_artifact_generator
        class MyArtifactGenerator(ArtifactGenerator):
            name = "my_generator"
            ...
    """
    instance = cls()
    if not instance.name or instance.name == "base":
        raise ValueError(
            f"ArtifactGenerator {cls.__name__} must define a unique 'name'."
        )
    _REGISTRY[instance.name] = instance
    logger.debug("Registered artifact generator: %s", instance.name)
    return cls


def get_artifact_generators() -> list[ArtifactGenerator]:
    """Return all enabled generators ordered by descending priority."""
    return sorted(
        (g for g in _REGISTRY.values() if g.enabled),
        key=lambda g: g.priority,
        reverse=True,
    )


def clear_registry() -> None:
    _REGISTRY.clear()
