"""CorrectionLearning API — CEO artifact correction capture and style learning."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.deps import get_organization_id
from app.core.database import get_session
from app.schemas.correction import CorrectionIn, CorrectionOut, StyleProfileOut
from app.services.correction_learning import CorrectionLearningService

router = APIRouter(prefix="/learning", tags=["Correction Learning (Self-Learning)"])


def _get_service(session: Session = Depends(get_session)) -> CorrectionLearningService:
    return CorrectionLearningService(session)


@router.post(
    "/corrections",
    response_model=CorrectionOut,
    summary="Record a CEO artifact correction and update the style profile",
)
def record_correction(
    body: CorrectionIn,
    service: CorrectionLearningService = Depends(_get_service),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> CorrectionOut:
    """Submit a corrected artifact for learning.

    When the CEO edits a generated email, meeting agenda, or LinkedIn message,
    this endpoint captures the diff, extracts style rules, and updates the
    ``UserStyleProfile``. Future artifact generations will automatically
    incorporate the learned preferences.

    The response includes:
    - ``diff_ops``: what changed (deleted social opener, added data, shortened, etc.)
    - ``extracted_rules``: style rules learned from this correction
    - ``style_summary``: the updated prompt injection string for the AI
    - ``authoritative_rules_count``: rules confirmed ≥ 3 times (high confidence)
    - ``profile_version``: incremented version for cache invalidation
    """
    result = service.record_correction(
        original_content=body.original_content,
        edited_content=body.edited_content,
        artifact_type=body.artifact_type,
        opportunity_id=body.opportunity_id,
        lead_id=body.lead_id,
        generator_name=body.generator_name,
        psychographic_style=body.psychographic_style,
        channel=body.channel,
        organization_id=organization_id,
    )
    session.commit()
    return result


@router.get(
    "/style-profile",
    response_model=StyleProfileOut,
    summary="Get the current CEO style profile",
)
def get_style_profile(
    service: CorrectionLearningService = Depends(_get_service),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> StyleProfileOut:
    """Return the accumulated CEO writing style preferences.

    Shows:
    - All learned style rules grouped by artifact type
    - Confidence weights (authoritative = confirmed ≥ 3 times)
    - The current prompt injection string used by BEE's AI
    - Total corrections processed and profile version
    """
    return service.get_style_profile(organization_id)


@router.get(
    "/corrections",
    response_model=list[CorrectionOut],
    summary="List past corrections",
)
def list_corrections(
    artifact_type: str | None = Query(default=None),
    opportunity_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    service: CorrectionLearningService = Depends(_get_service),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[CorrectionOut]:
    """Browse the history of CEO artifact corrections."""
    corrections = service.list_corrections(
        artifact_type=artifact_type,
        opportunity_id=opportunity_id,
        limit=limit,
        organization_id=organization_id,
    )
    return [
        CorrectionOut(
            correction_id=c.id,
            artifact_type=c.artifact_type,
            diff_ops=c.diff_ops,
            extracted_rules=c.extracted_rules,
            change_ratio=c.change_ratio,
            style_summary="",
            authoritative_rules_count=0,
            total_corrections=0,
            profile_version=0,
        )
        for c in corrections
    ]
