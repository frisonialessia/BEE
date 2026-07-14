"""Market insights and A/B variant endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.insights import MarketInsightOut, TrendAnalysisResult
from app.schemas.variants import VariantCreateIn, VariantOut
from app.services.feedback_loop.service import FeedbackLoopService
from app.services.trend_analyst import TrendAnalyst

router = APIRouter(tags=["Intelligence"])


# ── TrendAnalyst endpoints ────────────────────────────────────────────────────

insights_router = APIRouter(prefix="/insights")


@insights_router.post(
    "/analyze",
    response_model=TrendAnalysisResult,
    summary="Trigger a TrendAnalyst cycle (detect market patterns)",
)
def run_trend_analysis(
    window_days: int = Query(default=7, ge=1, le=90),
    session: Session = Depends(get_session),
) -> TrendAnalysisResult:
    """Run the TrendAnalyst to detect aggregate signal patterns.

    This should be called on a schedule (cron/background task) or on-demand
    when new signals arrive. Creates fresh ``MarketInsight`` records that the
    ``StrategyGeneratorService`` uses to sharpen battlecards.
    """
    analyst = TrendAnalyst(session)
    return analyst.analyze(window_days=window_days)


@insights_router.get(
    "",
    response_model=list[MarketInsightOut],
    summary="List active market insights",
)
def list_insights(
    signal_type: str | None = Query(default=None),
    industry: str | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    session: Session = Depends(get_session),
) -> list[MarketInsightOut]:
    from app.repositories.market_insight import MarketInsightRepository
    repo = MarketInsightRepository(session)
    rows = repo.get_active_insights(signal_type=signal_type, industry=industry, limit=limit)
    return [MarketInsightOut.model_validate(r) for r in rows]


router.include_router(insights_router)


# ── A/B Variant endpoints ────────────────────────────────────────────────────

variants_router = APIRouter(prefix="/variants")


@variants_router.post(
    "",
    response_model=VariantOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new A/B tactic variant experiment",
)
def create_variant(
    body: VariantCreateIn,
    session: Session = Depends(get_session),
) -> VariantOut:
    """Create a new A/B experiment comparing two tactical approaches.

    The experiment will activate immediately and randomly assign incoming
    enrichments to arm_a or arm_b based on ``traffic_split``.
    """
    svc = FeedbackLoopService(session)
    return svc.create_variant(body)


@variants_router.get(
    "",
    response_model=list[VariantOut],
    summary="List all tactic variants",
)
def list_variants(session: Session = Depends(get_session)) -> list[VariantOut]:
    svc = FeedbackLoopService(session)
    return svc.list_variants()


@variants_router.get(
    "/{variant_id}",
    response_model=VariantOut,
    summary="Get variant results",
)
def get_variant(
    variant_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> VariantOut:
    svc = FeedbackLoopService(session)
    try:
        return svc.get_variant(variant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@variants_router.post(
    "/{variant_id}/conclude",
    response_model=VariantOut,
    summary="Manually conclude a variant and declare a winner",
)
def conclude_variant(
    variant_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> VariantOut:
    svc = FeedbackLoopService(session)
    try:
        return svc.conclude_variant(variant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


router.include_router(variants_router)
