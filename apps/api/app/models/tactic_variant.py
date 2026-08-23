"""TacticVariant and VariantOutcome — BEE's A/B testing engine.

A ``TacticVariant`` defines an experiment comparing two tactical approaches
(arm_a vs arm_b) for a specific signal type. When a variant is active, the
``StrategyGeneratorService`` randomly assigns each new enrichment to one arm
(based on ``traffic_split``) and records which arm was used in the
``StrategyOutcome``.

The experiment concludes when:
1. A statistically meaningful difference in win rate emerges (Δ win_rate > 0.10,
   n ≥ ``min_samples_per_arm``), OR
2. The experimenter manually calls the conclude endpoint.

The winner arm's playbook/channel becomes the new default hint for future
enrichments of that signal type — closing the A/B → Learning → Deployment loop.

Example experiment
------------------
Hypothesis: "For funding signals, LinkedIn outreach closes more deals than email."

arm_a (control):  { "channel": "email",    "playbook": "post_funding_outreach" }
arm_b (variant):  { "channel": "linkedin", "playbook": "post_funding_outreach" }
traffic_split: 0.5  # 50% to arm_a, 50% to arm_b

After 30 closed deals per arm: arm_b shows 68% win rate vs arm_a 52%.
→ Variant concluded: arm_b wins. LinkedIn becomes the preferred channel for
  funding signals in future FeedbackLoopService hints.
"""

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, VariantStatus, new_uuid


class TacticVariant(TimestampMixin, table=True):
    """An active A/B experiment comparing two tactical approaches."""

    __tablename__ = "tactic_variants"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )

    # ── Experiment definition ────────────────────────────────────────────────
    name: str = Field(nullable=False, index=True)
    description: str | None = Field(default=None)
    hypothesis: str | None = Field(
        default=None,
        description="What we expect to learn from this experiment.",
    )

    # ── Scope (which signals this variant applies to) ─────────────────────────
    signal_type: str = Field(index=True, nullable=False)
    industry: str | None = Field(default=None, index=True)

    # ── Arms ─────────────────────────────────────────────────────────────────
    # Each arm is a partial override of the default generator output.
    # Supported keys: "channel", "playbook", "urgency_override", "next_best_action"
    arm_a_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    arm_b_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ── Traffic split ────────────────────────────────────────────────────────
    # Fraction of traffic going to arm_a (0.0–1.0). arm_b gets 1 - traffic_split.
    traffic_split: float = Field(default=0.5)  # 50/50 by default

    # ── Stopping criteria ─────────────────────────────────────────────────────
    min_samples_per_arm: int = Field(default=10)

    # ── Status ────────────────────────────────────────────────────────────────
    status: VariantStatus = Field(default=VariantStatus.ACTIVE, index=True)
    winner_arm: str | None = Field(default=None)  # "a" | "b" | None

    # ── Results summary (updated lazily) ─────────────────────────────────────
    arm_a_wins: int = Field(default=0)
    arm_a_total: int = Field(default=0)
    arm_b_wins: int = Field(default=0)
    arm_b_total: int = Field(default=0)

    @property
    def arm_a_win_rate(self) -> float:
        return self.arm_a_wins / self.arm_a_total if self.arm_a_total > 0 else 0.0

    @property
    def arm_b_win_rate(self) -> float:
        return self.arm_b_wins / self.arm_b_total if self.arm_b_total > 0 else 0.0

    @property
    def is_ready_to_conclude(self) -> bool:
        """True when we have enough data to declare a winner."""
        if self.arm_a_total < self.min_samples_per_arm:
            return False
        if self.arm_b_total < self.min_samples_per_arm:
            return False
        delta = abs(self.arm_a_win_rate - self.arm_b_win_rate)
        return delta >= 0.10  # 10 percentage point meaningful difference


class VariantOutcome(TimestampMixin, table=True):
    """Records which variant arm was used for each closed strategy outcome.

    Linked to StrategyOutcome so win-rate analysis is per-arm.
    """

    __tablename__ = "variant_outcomes"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True)
    variant_id: uuid.UUID = Field(index=True, nullable=False)
    strategy_outcome_id: uuid.UUID = Field(index=True, nullable=False)
    arm: str = Field(nullable=False)  # "a" | "b"
    won: bool = Field(default=False)
