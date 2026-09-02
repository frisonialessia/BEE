"""Strategy data model and Battlecard API schemas.

This module is the **single source of truth** for what a complete sales strategy
looks like inside BEE. Every field has a precise definition so that any generator
— rule-based today, LLM-powered tomorrow — produces a consistent contract that
the dashboard can render without further processing.

CEO battlecard minimum requirements
------------------------------------
Three fields are mandatory for a salesperson to take meaningful action. An
opportunity may NOT transition to ``READY_TO_ACTION`` unless all three are
populated by the StrategyGeneratorService:

1. **pain_point**      — *What problem is the lead experiencing right now?*
   The signal is evidence of a change event. A pain_point connects that event to
   a concrete business friction the lead is likely feeling. This is the hook.

2. **closing_argument** — *What does the CEO say in the first 30 seconds?*
   A 1-3 sentence tactical script that opens the conversation with relevance and
   urgency. Not a generic pitch — tailored to the signal type and company context.

3. **timing_window**   — *Why now, and how long does the window stay open?*
   Every trigger has a half-life. This field quantifies the urgency (immediate /
   this_week / this_month / watch), explains WHY the moment is right, and
   optionally names when the window closes.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class TimingWindow(BaseModel):
    """Quantifies when and why to contact, and for how long the window stays open.

    The urgency levels are ordered by time-sensitivity:
    * ``immediate``  — contact within 24-48 h (e.g. funding just announced)
    * ``this_week``  — contact within 7 days (e.g. leadership change detected)
    * ``this_month`` — contact within 30 days (e.g. tech adoption signal)
    * ``watch``      — no immediate action, monitor for follow-up triggers
    """

    urgency: Literal["immediate", "this_week", "this_month", "watch"] = "this_week"

    # Why this specific moment is the right time to engage.
    reason: str = Field(
        ...,
        examples=["Budget is being allocated in the first 60 days post-funding close."],
    )

    # An optional ISO-8601 date or human-readable phrase for when the window closes.
    expires_at: str | None = Field(
        default=None,
        examples=["90 days post-funding", "2026-09-30"],
    )


class StrategySchema(BaseModel):
    """Fully-typed contract for the ``strategy`` JSON column on ``Opportunity``.

    This schema must be satisfied before an opportunity is marked
    ``READY_TO_ACTION``. Generators — whether rule-based or LLM-powered — must
    populate at minimum the three CEO battlecard fields. The remaining fields add
    depth to the play but are not blocking.

    AI integration
    --------------
    When wiring GPT-4o or Claude as a generator, the LLM should be prompted to
    populate all fields in this schema. The ``generator`` / ``generator_version``
    fields let the UI and auditors see exactly which model produced the strategy.
    """

    model_config = ConfigDict(populate_by_name=True)

    # ── CEO Battlecard (mandatory gate for READY_TO_ACTION) ─────────────────
    pain_point: str = Field(
        ...,
        description=(
            "The specific business pain the lead is experiencing RIGHT NOW, "
            "as evidenced by the triggering signal. Concrete, not generic."
        ),
        examples=[
            "With $20M just raised, Acme must deploy capital fast — their existing "
            "outbound stack can't scale to the new headcount plan."
        ],
    )
    closing_argument: str = Field(
        ...,
        description=(
            "1-3 sentence CEO-level script for the first 30 seconds of the call. "
            "References the signal explicitly. Creates relevance + urgency."
        ),
        examples=[
            "Congratulations on the Series B. Companies at this stage typically "
            "double their sales headcount in 90 days — we help those teams ramp "
            "2x faster. Would a 20-minute call this week make sense?"
        ],
    )
    timing_window: TimingWindow = Field(
        ...,
        description="When to contact, why now, and how long the window stays open.",
    )

    # ── Execution fields (enriched by every generator) ───────────────────────
    playbook: str = Field(
        default="generic_outreach",
        description="Named playbook from BEE's library. Used to route the opportunity.",
        examples=["post_funding_outreach", "hiring_growth_outreach"],
    )
    next_best_action: str = Field(
        default="reach_out",
        description="The single next action the rep should take.",
        examples=["reach_out", "research", "monitor", "book_demo"],
    )
    channel: str = Field(
        default="email",
        description="Recommended first-touch channel.",
        examples=["email", "linkedin", "phone", "whatsapp"],
    )
    rationale: str | None = Field(
        default=None,
        description="Internal explanation of why this opportunity was surfaced.",
    )

    # ── AI readiness / auditability ──────────────────────────────────────────
    generator: str = Field(
        default="rule_based",
        description=(
            "Identifier of the generator that produced this strategy. "
            "Values: 'rule_based' | 'gpt-4o' | 'claude-4' | etc."
        ),
    )
    generator_version: str = Field(
        default="1.0.0",
        description="SemVer of the generator for reproducibility and A/B testing.",
    )
    generated_at: datetime = Field(
        default_factory=lambda: __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ),
        description="UTC timestamp of when this strategy was generated.",
    )

    # ── Observability / quality gate ──────────────────────────────────────────
    confidence_score: float = Field(
        default=0.85,
        ge=0.0,
        le=1.0,
        description=(
            "Confidence that this strategy is correct for the context. "
            "Rule-based generators set 0.85 (deterministic but templated). "
            "LLM generators derive this from model uncertainty. "
            "Values below 0.80 trigger manual_review_required."
        ),
    )
    manual_review_required: bool = Field(
        default=False,
        description=(
            "True when confidence_score < 0.80. The CEO must review "
            "and approve before the AgentOrchestrator permits execution. "
            "Displayed as a warning badge on the battlecard."
        ),
    )
    # A/B testing: which variant arm produced this strategy (null = no variant)
    variant_id: str | None = Field(default=None)
    variant_arm: str | None = Field(default=None)  # "a" | "b"

    def is_battlecard_complete(self) -> bool:
        """Return True when the three mandatory CEO fields are non-empty strings.

        The StrategyGeneratorService calls this to decide whether the opportunity
        qualifies for ``READY_TO_ACTION`` status.
        """
        return bool(self.pain_point and self.closing_argument and self.timing_window.reason)

    def to_db_dict(self) -> dict[str, Any]:
        """Serialize to a plain dict suitable for the JSON database column."""
        return self.model_dump(mode="json")


# ── Battlecard API response ───────────────────────────────────────────────────


class BattlecardCompany(BaseModel):
    """Company context snapshot embedded in the battlecard."""

    name: str | None = None
    domain: str | None = None
    industry: str | None = None
    country: str | None = None


class BattlecardLead(BaseModel):
    """Lead context snapshot embedded in the battlecard."""

    full_name: str | None = None
    title: str | None = None
    email: str | None = None
    seniority: str | None = None
    linkedin_url: str | None = None


class BattlecardSignal(BaseModel):
    """Signal context embedded in the battlecard — the evidence for the play."""

    id: uuid.UUID
    signal_type: str
    title: str
    description: str | None = None
    score: float
    detected_at: datetime
    tags: list[str] = Field(default_factory=list)


class BattlecardOut(BaseModel):
    """Fully synthesized battlecard — frontend-ready, no post-processing needed.

    This is what the dashboard renders for a salesperson who needs to act on an
    opportunity. It bundles all context (company, lead, signal, strategy) so the
    frontend makes exactly one API call and has everything it needs.
    """

    model_config = ConfigDict(from_attributes=True)

    opportunity_id: uuid.UUID
    title: str
    status: str
    # Revenue Continuity Radar — "new_logo" | "expansion" | "renewal_risk".
    # See app.models.base.OPPORTUNITY_TYPES and RevenueContinuityService.
    opportunity_type: str = "new_logo"
    score: float
    ready_to_action: bool
    hot_lead: bool = False  # True when BehavioralCollector detects buying intent
    manual_review_required: bool = False  # True when strategy confidence < 0.80

    company: BattlecardCompany
    lead: BattlecardLead
    signal: BattlecardSignal
    strategy: StrategySchema

    created_at: datetime
    updated_at: datetime
