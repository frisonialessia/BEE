"""PersonalBrand API endpoints — voice profile, fragments, context retrieval."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_organization_id, require_organization_id
from app.core.database import get_session
from app.schemas.brand import (
    BrandContextQuery,
    BrandContextResult,
    BrandFragmentCreate,
    BrandFragmentOut,
    BrandVoicePreviewRequest,
    BrandVoicePreviewResult,
    VoiceProfileCreate,
    VoiceProfileExtractRequest,
    VoiceProfileExtractResult,
    VoiceProfileOut,
)
from app.services.personal_brand import PersonalBrandService
from app.services.vector_store import get_vector_store

router = APIRouter(prefix="/brand", tags=["Personal Brand (Voice Brain)"])


def _get_service(session: Session = Depends(get_session)) -> PersonalBrandService:
    return PersonalBrandService(session, get_vector_store())


@router.post(
    "/profile",
    response_model=VoiceProfileOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create or replace the CEO voice profile",
)
def create_or_update_profile(
    data: VoiceProfileCreate,
    svc: PersonalBrandService = Depends(_get_service),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_id),
) -> VoiceProfileOut:
    """Define the CEO's brand DNA (tone, authority topics, forbidden phrases).

    Only one active profile exists at a time *per organization*. Calling this
    endpoint replaces the caller's own previous one. The old profile is kept
    for audit but deactivated.
    """
    profile = svc.create_or_update_profile(data, organization_id)
    session.commit()
    session.refresh(profile)
    return VoiceProfileOut.model_validate(profile)


@router.post(
    "/profile/extract",
    response_model=VoiceProfileExtractResult,
    summary="Propose a voice profile draft from pasted writing samples",
)
def extract_profile(
    data: VoiceProfileExtractRequest,
    svc: PersonalBrandService = Depends(_get_service),
    _organization_id: uuid.UUID = Depends(require_organization_id),
) -> VoiceProfileExtractResult:
    """Analyze pasted samples (emails, LinkedIn posts, past outreach) and
    propose tone, authority topics, and CTA — instead of the CEO filling out
    every VoiceProfile field by hand.

    This is a draft only: nothing is persisted. The caller reviews/edits the
    result and still submits it through ``POST /brand/profile`` to save it.
    Uses the configured LLM when available (AI_PROVIDER); falls back to a
    deterministic heuristic extractor otherwise — never fails outright.
    """
    return svc.extract_profile_draft(data.raw_text)


@router.post(
    "/profile/preview",
    response_model=BrandVoicePreviewResult,
    summary="Live preview: generic AI output vs. this org's own voice",
)
def preview_voice(
    data: BrandVoicePreviewRequest,
    svc: PersonalBrandService = Depends(_get_service),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> BrandVoicePreviewResult:
    """Generate a short side-by-side sample on a topic: what a generic AI
    tool would write vs. what this org's configured voice actually changes.

    Nothing is persisted. Uses the configured LLM when available; falls back
    to a deterministic template on any failure. 404s only when there is no
    active voice profile yet — set one up first.
    """
    result = svc.generate_preview(data.topic, organization_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active voice profile. Create one first.")
    return result


@router.get(
    "/profile",
    response_model=VoiceProfileOut | None,
    summary="Get the active CEO voice profile (null when none exists yet)",
)
def get_profile(
    svc: PersonalBrandService = Depends(_get_service),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> VoiceProfileOut | None:
    """``null`` (200), not 404, when the organization hasn't created a voice
    profile yet: "no profile" is the normal first-run state of every new
    account, not an error — and a 404 here lit up the browser console with
    a red "Failed to load resource" on every visit to /dashboard/brand until
    the profile existed, indistinguishable from a real broken call."""
    profile = svc.get_active_profile(organization_id)
    if not profile:
        return None
    return VoiceProfileOut.model_validate(profile)


@router.post(
    "/profile/{profile_id}/fragments",
    response_model=BrandFragmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a brand knowledge fragment",
)
def add_fragment(
    profile_id: uuid.UUID,
    data: BrandFragmentCreate,
    svc: PersonalBrandService = Depends(_get_service),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_id),
) -> BrandFragmentOut:
    """Add an example post, key insight, or signature phrase to the knowledge base.

    The fragment is simultaneously stored in:
    * The relational DB (for CRUD and audit)
    * The VectorStore (for semantic search during content generation)
    """
    fragment = svc.add_fragment(profile_id, data, organization_id)
    if fragment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voice profile not found.")
    session.commit()
    session.refresh(fragment)
    return BrandFragmentOut.model_validate(fragment)


@router.get(
    "/profile/{profile_id}/fragments",
    response_model=list[BrandFragmentOut],
    summary="List brand knowledge fragments",
)
def list_fragments(
    profile_id: uuid.UUID,
    category: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    svc: PersonalBrandService = Depends(_get_service),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[BrandFragmentOut]:
    fragments = svc.list_fragments(profile_id, category=category, limit=limit, organization_id=organization_id)
    return [BrandFragmentOut.model_validate(f) for f in fragments]


@router.delete(
    "/fragments/{fragment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a brand fragment",
)
def delete_fragment(
    fragment_id: uuid.UUID,
    svc: PersonalBrandService = Depends(_get_service),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_id),
) -> None:
    ok = svc.delete_fragment(fragment_id, organization_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fragment not found")
    session.commit()


@router.post(
    "/context",
    response_model=BrandContextResult,
    summary="Retrieve brand context for a topic (semantic search)",
)
def get_brand_context(
    query: BrandContextQuery,
    svc: PersonalBrandService = Depends(_get_service),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> BrandContextResult:
    """Retrieve semantically relevant brand fragments for a given topic.

    This is the endpoint the ExecutiveAgent calls internally before generating
    any content. Expose it for testing and transparency.

    Returns:
    * The active VoiceProfile
    * Top-k semantically similar brand fragments
    * A ``brand_brief`` string ready for injection into AI prompts
    """
    return svc.get_brand_context(
        query=query.query,
        top_k=query.top_k,
        category_filter=query.category_filter,
        tag_filter=query.tag_filter or None,
        organization_id=organization_id,
    )


@router.get(
    "/channels/status",
    summary="Check authentication and rate-limit status for all channels",
)
def channel_status(session: Session = Depends(get_session)) -> list[dict]:
    """Return the authentication and rate-limit status for LinkedIn, Email, and X."""
    from app.services.omnichannel import OmnichannelGateway
    gateway = OmnichannelGateway(session)
    return gateway.get_channel_status()
