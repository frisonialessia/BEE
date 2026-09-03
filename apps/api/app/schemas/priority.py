"""Schemas for GET /api/v1/priority/today — the Bandeja de Decisiones."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

DecisionKind = Literal["opportunity", "anomaly"]
DecisionUrgency = Literal["low", "medium", "high"]
RecommendedAction = Literal["call", "email", "review", "wait", "pause"]
# Structured "why" — the frontend translates these into the viewer's locale
# (see decision-feed.tsx's `reasons.*` messages); ``headline``/``reasoning``
# stay as the Spanish server rendering for API consumers without a
# translation layer (Slack digest, integrations, tests).
DecisionReasonCode = Literal["pending_approval", "hot_lead", "cycle_overdue", "in_pipeline", "anomaly"]


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
    reason_code: DecisionReasonCode = "in_pipeline"
    # Values the localized template interpolates (score, stage, days…) —
    # numbers stay numbers so the client can format them per locale.
    reason_params: dict[str, Any] = Field(default_factory=dict)
    opportunity_id: uuid.UUID | None = None
    pending_action_id: uuid.UUID | None = None
    score: float


class TodayFeedOut(BaseModel):
    cards: list[DecisionCard]
    generated_at: str
