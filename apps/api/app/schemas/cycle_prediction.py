"""Schema for CyclePredictorService — GET /opportunities/{id}/cycle-prediction."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


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
