"""ExecutiveAgent abstractions.

The ExecutiveAgent is BEE's execution layer — the bridge between a rich strategy
and real-world sales actions. It takes an already-enriched ``StrategySchema`` and
transforms it into concrete, immediately usable execution artifacts.

Architecture
------------
Like the ``StrategyGenerator``, this layer is pluggable. Each ``ArtifactGenerator``
produces one artifact type (email draft, meeting structure, next steps) and is
registered via ``@register_artifact_generator``. This means:

* Adding a new artifact type = one new class + decorator.
* Swapping the email drafting logic for an LLM = new generator at priority=1000.
* Disabling an artifact type = unregister or set ``enabled = False``.

Decoupled execution
-------------------
The ExecutiveAgent never sends emails or books meetings. Its job is to produce
a JSON-serializable ``ArtifactBundle`` that is:

1. Returned to the frontend for "One-Click Action" UX.
2. Posted to a configurable webhook URL (n8n / Zapier / Make) for external
   execution. The webhook listener decides what to actually do with the artifact.

This keeps BEE's intelligence core strictly separated from execution tooling —
you can swap n8n for a native integration without touching a line of BEE code.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.executive import (
        EmailDraftArtifact,
        MeetingStructureArtifact,
        NextStepsArtifact,
    )
    from app.schemas.strategy import StrategySchema


@dataclass(slots=True)
class ArtifactContext:
    """Everything an artifact generator needs to produce its output.

    A thin wrapper over the already-computed strategy and the enrichment context
    used to generate it. Decoupled from ORM so generators are trivially testable.
    """

    strategy: StrategySchema
    company_name: str
    lead_name: str
    lead_title: str | None = None
    signal_type: str = "other"
    signal_title: str = ""
    opportunity_title: str = ""
    # Learned CEO writing style preferences — auto-injected from CorrectionLearningService
    style_hint: str = ""


class ArtifactGenerator(ABC):
    """Base class for all execution artifact generators.

    Each concrete subclass produces exactly one artifact type. The registry
    runs all of them and assembles the results into an ``ArtifactBundle``.
    """

    name: str = "base"
    priority: int = 0
    enabled: bool = True

    @abstractmethod
    def generate_email(self, ctx: ArtifactContext) -> EmailDraftArtifact:
        raise NotImplementedError

    @abstractmethod
    def generate_meeting(self, ctx: ArtifactContext) -> MeetingStructureArtifact:
        raise NotImplementedError

    @abstractmethod
    def generate_next_steps(self, ctx: ArtifactContext) -> NextStepsArtifact:
        raise NotImplementedError
