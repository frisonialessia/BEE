"""Schemas for the RevenueSimulator endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SimulatorScenario(BaseModel):
    """One revenue projection scenario."""

    label: str  # "Conservative" | "Realistic" | "Optimistic"
    multiplier: float  # 0.70 | 1.00 | 1.30
    prospecting_increase_factor: float
    projected_new_pipeline: int
    projected_won_deals: int
    # Relative to baseline (current without changes)
    uplift_vs_baseline: int


class RevenueSimulation(BaseModel):
    """Full revenue projection from the RevenueSimulator.

    Returned by ``GET /api/v1/analytics/simulator``. The frontend renders this
    as a "What-If" card for the CEO dashboard — no numbers are invented, every
    projection comes from real FeedbackLoopService win-rate data.
    """

    # ── Input segment ─────────────────────────────────────────────────────────
    signal_type: str
    industry: str | None
    increase_factor: float = Field(
        description="Prospecting multiplier (e.g. 2.0 = double the outreach volume)."
    )

    # ── Current state ─────────────────────────────────────────────────────────
    current_pipeline_count: int = Field(
        description="Open READY_TO_ACTION opportunities in this segment right now."
    )
    historical_win_rate: float = Field(
        description="Win rate from FeedbackLoopService (0-1). 0 when no history yet."
    )
    data_confidence: str = Field(
        description="'none' | 'low' | 'medium' | 'high' based on sample size."
    )
    sample_size: int = Field(description="Number of closed deals this rate is based on.")

    # ── Baseline (no change) ───────────────────────────────────────────────────
    baseline_expected_won: int = Field(
        description="Expected wins from current pipeline at the historical win rate."
    )

    # ── Scenarios ─────────────────────────────────────────────────────────────
    scenarios: list[SimulatorScenario]

    # ── Top performing playbook (from win-rate aggregation) ───────────────────
    top_playbook: str | None
    top_channel: str | None

    # ── Natural-language recommendation ───────────────────────────────────────
    recommendation: str

    # ── Data freshness warning ────────────────────────────────────────────────
    disclaimer: str = (
        "Projections are based on historical closed-deal data from BEE's "
        "FeedbackLoopService. Results depend on data sample size and may not "
        "reflect future market conditions."
    )
