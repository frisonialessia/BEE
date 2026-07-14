"""DarkFunnelService API endpoints — intent signal ingestion and hot leads dashboard."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.dark_funnel import (
    DarkFunnelSignalIn,
    DarkFunnelSignalOut,
    DarkFunnelSummary,
    HotLeadOut,
)
from app.services.dark_funnel import DarkFunnelService

router = APIRouter(prefix="/dark-funnel", tags=["Dark Funnel (Intent Intelligence)"])


def _get_service(session: Session = Depends(get_session)) -> DarkFunnelService:
    return DarkFunnelService(session)


@router.post(
    "/signals",
    response_model=DarkFunnelSignalOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a dark funnel intent signal",
)
def ingest_signal(
    data: DarkFunnelSignalIn,
    svc: DarkFunnelService = Depends(_get_service),
    session: Session = Depends(get_session),
) -> DarkFunnelSignalOut:
    """Submit an external intent signal from any source.

    Supported signal types:
    * ``review_visit`` — Company visited G2, Capterra, or Trustpilot
    * ``competitor_compare`` — Viewed a comparison or alternative page
    * ``pricing_view`` — Visited your pricing page
    * ``demo_watch`` — Watched a demo video
    * ``product_trial`` — Started a trial or freemium
    * ``search`` — Organic search for solution keywords
    * ``content_read`` — Blog, case study, or white paper read
    * ``job_posting`` — Company posted a job matching your buyer profile
    * ``repeat_visit`` — Multiple visits to key pages

    After ingesting the signal, the company's ``research_intensity_score``
    is immediately recomputed and the ``buying_stage`` is updated.
    """
    result = svc.ingest_signal(data)
    session.commit()
    return result


@router.post(
    "/signals/batch",
    response_model=list[DarkFunnelSignalOut],
    status_code=status.HTTP_201_CREATED,
    summary="Ingest multiple intent signals in one request",
)
def ingest_batch(
    signals: list[DarkFunnelSignalIn],
    svc: DarkFunnelService = Depends(_get_service),
    session: Session = Depends(get_session),
) -> list[DarkFunnelSignalOut]:
    results = svc.ingest_batch(signals)
    session.commit()
    return results


@router.get(
    "/hot-leads",
    response_model=list[HotLeadOut],
    summary="Get hot leads sorted by research intensity score",
)
def get_hot_leads(
    min_score: float = Query(default=0.0, ge=0, le=100),
    buying_stage: str | None = Query(default=None),
    hot_only: bool = Query(default=False, description="Return only is_hot=True leads"),
    limit: int = Query(default=50, le=200),
    svc: DarkFunnelService = Depends(_get_service),
) -> list[HotLeadOut]:
    """Return companies showing active buying intent, sorted by intensity score.

    This endpoint **replaces the BehavioralCollector** as the primary hot lead
    engine in the CEO dashboard. It provides:

    * ``research_intensity_score``: 0-100 composite intent score (> 50 = hot)
    * ``buying_stage``: awareness → consideration → decision → ready_to_buy
    * ``signal_types_seen``: what kinds of intent the company has shown
    * ``top_intent_keywords``: what they're researching

    Use ``?hot_only=true`` to see only companies above the hot threshold.
    Use ``?buying_stage=ready_to_buy`` to filter by stage.
    """
    return svc.get_hot_leads(min_score=min_score, buying_stage=buying_stage, limit=limit, hot_only=hot_only)


@router.get(
    "/hot-leads/{company_domain}",
    response_model=HotLeadOut | None,
    summary="Get the intent score for a specific company domain",
)
def get_company_score(
    company_domain: str,
    svc: DarkFunnelService = Depends(_get_service),
) -> HotLeadOut | None:
    return svc.get_company_score(company_domain)


@router.get(
    "/signals/{company_domain}",
    response_model=list[DarkFunnelSignalOut],
    summary="Get all dark funnel signals for a company domain",
)
def get_domain_signals(
    company_domain: str,
    limit: int = Query(default=50, le=200),
    svc: DarkFunnelService = Depends(_get_service),
) -> list[DarkFunnelSignalOut]:
    return svc.get_signals_for_domain(company_domain, limit=limit)


@router.get(
    "/summary",
    response_model=DarkFunnelSummary,
    summary="Dark funnel pipeline overview",
)
def get_summary(svc: DarkFunnelService = Depends(_get_service)) -> DarkFunnelSummary:
    """Return aggregate statistics for the dark funnel dashboard."""
    return svc.get_summary()
