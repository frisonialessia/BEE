"""Schemas for the ScenarioSimulator API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ScenarioRequest(BaseModel):
    """Parameters for a What-If prospecting simulation."""

    sector: str | None = Field(default=None, description="Target sector (e.g., 'fintech', 'saas', 'retail')")
    signal_type: str | None = Field(default=None, description="Signal type to filter history (e.g., 'funding_round')")
    channel: str | None = Field(default="email", description="Primary outreach channel: email | linkedin | warm_intro | twitter")
    psychographic_style: str | None = Field(default=None, description="Target DISC style: D | I | S | C")
    target_monthly_signals: int = Field(default=10, ge=1, le=500, description="Target signals to process per month")
    additional_prospecting_reps: int | None = Field(default=0, ge=0, le=20, description="Additional prospecting reps to add")
    dark_funnel_heat: float | None = Field(default=None, ge=0, le=100, description="Average dark funnel heat score for this segment (0-100)")


class ScenarioVariant(BaseModel):
    """A single scenario projection (conservative, realistic, or optimistic)."""

    label: str
    win_rate: float
    monthly_wins: float
    monthly_revenue: float
    quarterly_revenue: float
    annual_revenue: float


class ScenarioResult(BaseModel):
    """Full simulation result with three projections and analysis."""

    scenario_id: str
    sector: str | None
    signal_type: str | None
    channel: str | None
    psychographic_style: str | None

    base_win_rate: float
    effective_win_rate: float
    channel_modifier: float
    disc_modifier: float
    signal_modifier: float
    dark_funnel_modifier: float

    target_monthly_signals: int
    adjusted_monthly_signals: float
    avg_deal_value: float
    median_cycle_days: int

    conservative: ScenarioVariant
    realistic: ScenarioVariant
    optimistic: ScenarioVariant

    key_drivers: list[str]
    risk_factors: list[str]
    recommended_actions: list[str]

    historical_sample_size: int
    low_data_confidence: bool
    has_any_historical_data: bool = Field(
        description="False when this organization has zero closed StrategyOutcome records of any "
        "kind — win_rate/avg_deal_value/the three projections are entirely industry-benchmark "
        "estimates rather than anything measured from this tenant's own pipeline. Distinct from "
        "low_data_confidence, which can still be True with real (just sparse) data.",
    )
    supporting_data: dict[str, Any]
