"""Analyzer abstractions for the Signal Engine.

This is the extension point of BEE. A *signal analyzer* inspects an inbound
payload and, when relevant, produces an :class:`AnalysisResult` that classifies,
scores, and enriches the signal — and optionally proposes a strategy that turns
the signal into an opportunity.

Why this shape?
---------------
* **Open/Closed Principle**: new intelligence is added by writing a new analyzer
  and registering it. Existing code — the engine, the endpoint, the models —
  never changes.
* **Single Responsibility**: each analyzer owns exactly one kind of detection
  (funding, hiring, tech adoption, or, later, an LLM-based classifier).
* **Liskov Substitution**: the engine treats every analyzer through this uniform
  interface, so any analyzer (rule-based today, AI-powered tomorrow) is
  interchangeable.

Adding an AI analyzer later is deliberately trivial: subclass
:class:`SignalAnalyzer`, call your model inside :meth:`analyze`, and decorate the
class with ``@register_analyzer``. Nothing else in the system needs to change.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.models.base import SignalType
from app.schemas.signal import SignalWebhookIn


@dataclass(slots=True)
class AnalysisResult:
    """The structured verdict an analyzer returns for a payload.

    Attributes
    ----------
    signal_type:
        The classified category of the signal.
    score:
        Relevance/strength of the signal, ``0-100``. The engine keeps the
        highest score among contributing analyzers.
    confidence:
        The analyzer's confidence in its own classification, ``0-1``.
    tags:
        Free-form labels extracted from the payload (keywords, entities...).
    strategy:
        Optional recommended play. When present, the engine materializes an
        :class:`~app.models.opportunity.Opportunity` from it. This is where an
        AI analyzer would place generated next-best-actions and messaging.
    metadata:
        Any additional structured data the analyzer wants to attach to the
        signal's ``analysis`` field.
    """

    signal_type: SignalType = SignalType.OTHER
    score: float = 0.0
    confidence: float = 0.0
    tags: list[str] = field(default_factory=list)
    strategy: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class SignalAnalyzer(ABC):
    """Base class every signal analyzer must implement.

    Subclasses declare a unique :attr:`name` and implement :meth:`supports` and
    :meth:`analyze`. Keeping the surface this small makes analyzers cheap to
    write and easy to unit-test in isolation.
    """

    #: Unique, human-readable identifier used in logs and API responses.
    name: str = "base"

    #: Higher priority analyzers run first. Useful when a specialized analyzer
    #: should take precedence over a generic fallback.
    priority: int = 0

    @abstractmethod
    def supports(self, payload: SignalWebhookIn) -> bool:
        """Return ``True`` if this analyzer can meaningfully process ``payload``.

        The engine only invokes :meth:`analyze` for analyzers that return
        ``True`` here, so this method should be cheap and side-effect free.
        """
        raise NotImplementedError

    @abstractmethod
    def analyze(self, payload: SignalWebhookIn) -> AnalysisResult:
        """Inspect ``payload`` and return an :class:`AnalysisResult`."""
        raise NotImplementedError
