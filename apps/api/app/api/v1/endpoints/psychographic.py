"""PsychographicAnalyzer API endpoints — DISC profiling and content adaptation."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_organization_id
from app.core.database import get_session
from app.schemas.psychographic import AdaptedContent, ContentAdaptRequest, LeadPsychographicOut
from app.services.psychographic import PsychographicAnalyzer

router = APIRouter(prefix="/psychographic", tags=["Psychographic Analyzer (DISC)"])


def _get_analyzer(session: Session = Depends(get_session)) -> PsychographicAnalyzer:
    return PsychographicAnalyzer(session)


def _hidden_lead_or_404(lead, organization_id: uuid.UUID | None) -> None:
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if (
        organization_id is not None
        and lead.organization_id is not None
        and lead.organization_id != organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")


@router.get(
    "/leads/{lead_id}",
    response_model=LeadPsychographicOut,
    summary="Get or classify DISC profile for a lead",
)
def get_or_classify(
    lead_id: uuid.UUID,
    force: bool = Query(default=False, description="Force reclassification even if cached"),
    analyzer: PsychographicAnalyzer = Depends(_get_analyzer),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> LeadPsychographicOut:
    """Return the DISC communication style profile for a lead.

    Classifies lazily on first request (using job title heuristics) and caches
    the result. Use ``?force=true`` to reclassify with the latest lead data.

    DISC styles:
    * **D** (Dominance): Direct, ROI-focused, brief. Lead with bottom-line impact.
    * **I** (Influence): Enthusiastic, story-driven. Add social proof and energy.
    * **S** (Steadiness): Warm, process-focused. Reassurance and step-by-step.
    * **C** (Conscientiousness): Analytical. Data, precision, logical argument.
    """
    from app.models.lead import Lead
    lead = session.get(Lead, lead_id)
    _hidden_lead_or_404(lead, organization_id)

    profile = analyzer.reclassify(lead) if force else analyzer.get_or_classify(lead)

    session.commit()
    session.refresh(profile)
    return LeadPsychographicOut.model_validate(profile)


@router.post(
    "/adapt",
    response_model=AdaptedContent,
    summary="Adapt content to a lead's DISC communication style",
)
def adapt_content(
    body: ContentAdaptRequest,
    analyzer: PsychographicAnalyzer = Depends(_get_analyzer),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> AdaptedContent:
    """Run the content style middleware on a piece of text.

    This is the same middleware that the ExecutiveAgent applies automatically
    to all generated artifacts. Use this endpoint to preview DISC adaptation
    for any content.

    The adapted content:
    * Preserves all facts and strategic content
    * Adjusts tone, emphasis, structure, and phrasing to match DISC style
    * Appends a style note showing what adaptations were applied
    """
    from app.models.lead import Lead
    lead = session.get(Lead, body.lead_id)
    _hidden_lead_or_404(lead, organization_id)

    result = analyzer.adapt_content(body.content, lead, body.artifact_type)
    session.commit()
    return result


@router.get(
    "/profiles",
    response_model=list[LeadPsychographicOut],
    summary="List all DISC profiles",
)
def list_profiles(
    limit: int = Query(default=50, le=200),
    analyzer: PsychographicAnalyzer = Depends(_get_analyzer),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[LeadPsychographicOut]:
    profiles = analyzer.list_profiles(limit=limit, organization_id=organization_id)
    return [LeadPsychographicOut.model_validate(p) for p in profiles]
