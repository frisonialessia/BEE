"""PersonalBrand API endpoints — voice profile, fragments, context retrieval."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.brand import (
    BrandContextQuery,
    BrandContextResult,
    BrandFragmentCreate,
    BrandFragmentOut,
    VoiceProfileCreate,
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
) -> VoiceProfileOut:
    """Define the CEO's brand DNA (tone, authority topics, forbidden phrases).

    Only one active profile exists at a time. Calling this endpoint replaces the
    previous one. The old profile is kept for audit but deactivated.
    """
    profile = svc.create_or_update_profile(data)
    session.commit()
    session.refresh(profile)
    return VoiceProfileOut.model_validate(profile)


@router.get(
    "/profile",
    response_model=VoiceProfileOut,
    summary="Get the active CEO voice profile",
)
def get_profile(svc: PersonalBrandService = Depends(_get_service)) -> VoiceProfileOut:
    profile = svc.get_active_profile()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active voice profile. Create one first.")
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
) -> BrandFragmentOut:
    """Add an example post, key insight, or signature phrase to the knowledge base.

    The fragment is simultaneously stored in:
    * The relational DB (for CRUD and audit)
    * The VectorStore (for semantic search during content generation)
    """
    fragment = svc.add_fragment(profile_id, data)
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
) -> list[BrandFragmentOut]:
    fragments = svc.list_fragments(profile_id, category=category, limit=limit)
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
) -> None:
    ok = svc.delete_fragment(fragment_id)
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
