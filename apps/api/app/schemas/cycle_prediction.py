"""Schema for CyclePredictorService — GET /opportunities/{id}/cycle-prediction."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class SignalRecalibrationOut(BaseModel):
    """Whether a NEW market signal on the same company, detected while a
    deal was open, historically correlates with a faster or slower close —
    see CyclePredictorService's module docstring. Independent of the base
    prediction: never blended into ``predicted_cycle_days``."""

    available: bool
    reason: str | None = None
    with_signal_median_days: float | None = None
    with_signal_count: int = 0
    without_signal_median_days: float | None = None
    without_signal_count: int = 0
    delta_days: float | None = None
    target_has_new_signal: bool = False
    target_new_signal_types: list[str] = []


class CyclePredictionOut(BaseModel):
    """Predicted time-to-close for one open opportunity.

    ``available=False`` is a normal, expected response (not an error) for a
    closed opportunity or one with no comparable historical cohort yet —
    ``reason`` explains why, and every other field stays null rather than a
    fabricated number. See CyclePredictorService's module docstring for the
    full honesty rationale.
    """

    available: bool
    predicted_cycle_days: float | None = None
    predicted_close_date: date | None = None
    days_elapsed: int | None = None
    days_remaining: int | None = None
    is_overdue: bool = False
    cohort_size: int = 0
    cohort_basis: str | None = None
    confidence: str | None = None
    reason: str | None = None
    signal_recalibration: SignalRecalibrationOut | None = None
