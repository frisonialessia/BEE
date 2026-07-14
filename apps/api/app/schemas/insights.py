"""Schemas for TrendAnalyst and MarketInsight API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.base import InsightType


class MarketInsightOut(BaseModel):
    """API representation of a market insight."""

    id: uuid.UUID
    insight_type: InsightType
    signal_type: str | None
    industry: str | None
    title: str
    description: str
    tactical_implication: str | None
    confidence: float
    evidence_count: int
    is_active: bool
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TrendAnalysisResult(BaseModel):
    """Result returned by TrendAnalyst.analyze()."""

    insights_created: int
    insights_expired: int
    window_days: int
    signals_analyzed: int
    top_signal_types: list[dict[str, Any]]
    top_industries: list[dict[str, Any]]


class MarketInsightRef(BaseModel):
    """Lightweight reference injected into EnrichmentContext."""

    insight_type: str
    title: str
    description: str
    tactical_implication: str | None = None
    confidence: float

    def to_prompt_text(self) -> str:
        return (
            f"[Market: {self.insight_type}] {self.description}"
            + (f" → {self.tactical_implication}" if self.tactical_implication else "")
        )
