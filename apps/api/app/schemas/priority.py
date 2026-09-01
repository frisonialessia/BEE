"""Schemas for GET /api/v1/priority/today — the Bandeja de Decisiones."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel

DecisionKind = Literal["opportunity", "anomaly"]
DecisionUrgency = Literal["low", "medium", "high"]
RecommendedAction = Literal["call", "email", "review", "wait", "pause"]


class DecisionCard(BaseModel):
    """One entry in the Bandeja de Decisiones — a ranked, explained
    suggestion, never an auto-executed one. See
    app.services.priority_feed.build_today_feed for how these are ranked.
    """

    id: str
    kind: DecisionKind
    company_name: str | None
    headline: str
    reasoning: str
    urgency: DecisionUrgency
    recommended_action: RecommendedAction
    opportunity_id: uuid.UUID | None = None
    pending_action_id: uuid.UUID | None = None
    score: float


class TodayFeedOut(BaseModel):
    cards: list[DecisionCard]
    generated_at: str
