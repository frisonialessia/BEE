"""Feedback-loop learning endpoints — the visible "learn" step.

The rest of the perceive→judge→plan→act loop already has a face in the
product (Señales, Priorización, Estrategias, ejecución). This module is what
lets an operator actually see what BEE has learned from closed deals, instead
of that knowledge only ever being consumed silently by
``StrategyGeneratorService`` on the next enrichment.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.deps import get_organization_id
from app.core.database import get_session
from app.schemas.feedback import SuccessPatternOut
from app.services.feedback_loop.service import FeedbackLoopService

router = APIRouter(prefix="/feedback", tags=["Intelligence"])


@router.get(
    "/patterns",
    response_model=list[SuccessPatternOut],
    summary="Learned success patterns (the 'learn' step, made visible)",
)
def get_feedback_patterns(
    signal_type: str | None = Query(
        default=None,
        description="Scope to one signal type (e.g. 'funding_round'). Omit for the org's top patterns across all types.",
    ),
    industry: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[SuccessPatternOut]:
    """Return statistically grounded (playbook, channel, generator) win-rate
    patterns derived from real closed deals.

    Honesty guardrail: this is a thin read over
    ``FeedbackLoopService.get_patterns``, which never fabricates a pattern —
    every row already cleared the repository's minimum-sample floor. An
    organization with too few closed deals gets an empty list, not a guess.
    """
    svc = FeedbackLoopService(session)
    return svc.get_patterns(
        signal_type=signal_type,
        industry=industry,
        max_patterns=limit,
        organization_id=organization_id,
    )
