"""Organization API key endpoints — per-tenant credentials for signal ingestion.

See ``app.models.organization_api_key`` for why these exist (webhook callers
carry no JWT, so they need a different way to identify their organization)
and ``app.api.deps.get_organization_from_api_key`` for how ``POST
/signals/webhook`` consumes the ``X-BEE-Org-Key`` header these keys are
passed in.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.core.security import generate_api_key
from app.models.base import UserRole
from app.models.organization_api_key import OrganizationApiKey
from app.models.user import User
from app.schemas.auth import ApiKeyCreate, ApiKeyCreated, ApiKeyOut
from app.services.admin_audit import AdminAuditService

router = APIRouter(prefix="/organizations/api-keys", tags=["Organization API Keys"])

# How much of the plaintext key to keep around for display in a listing —
# enough to recognize which key is which, nowhere near enough to reconstruct it.
_PREFIX_DISPLAY_CHARS = 12


@router.post(
    "",
    response_model=ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a new organization API key (OWNER/ADMIN only)",
)
def create_api_key(
    data: ApiKeyCreate,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> ApiKeyCreated:
    """Generate a key and return its plaintext exactly once.

    The plaintext is never stored and cannot be retrieved again — if it's
    lost, revoke this key and generate a new one.
    """
    plaintext, key_hash = generate_api_key()
    key = OrganizationApiKey(
        organization_id=current_user.organization_id,
        created_by_user_id=current_user.id,
        name=data.name,
        key_prefix=plaintext[:_PREFIX_DISPLAY_CHARS],
        key_hash=key_hash,
    )
    session.add(key)
    session.flush()
    AdminAuditService(session).log(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        action="api_key.created",
        summary=f"{current_user.email} created API key '{data.name}'.",
        entity_type="organization_api_key",
        entity_id=key.id,
        # Never the plaintext or hash — key_prefix is already the
        # deliberately-safe "enough to recognize, not enough to reconstruct"
        # slice, same one shown in the listing UI.
        detail={"key_prefix": key.key_prefix},
    )
    session.commit()
    session.refresh(key)
    return ApiKeyCreated(api_key=plaintext, **ApiKeyOut.model_validate(key).model_dump())


@router.get("", response_model=list[ApiKeyOut], summary="List the caller's organization's API keys")
def list_api_keys(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[OrganizationApiKey]:
    statement = (
        select(OrganizationApiKey)
        .where(OrganizationApiKey.organization_id == current_user.organization_id)
        .order_by(OrganizationApiKey.created_at.desc())  # type: ignore[union-attr]
    )
    return list(session.exec(statement).all())


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an organization API key (OWNER/ADMIN only)",
)
def revoke_api_key(
    key_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> None:
    key = session.get(OrganizationApiKey, key_id)
    if key is None or key.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found.")
    key.is_active = False
    session.add(key)
    AdminAuditService(session).log(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        action="api_key.revoked",
        summary=f"{current_user.email} revoked API key '{key.name}'.",
        entity_type="organization_api_key",
        entity_id=key.id,
        detail={"key_prefix": key.key_prefix},
    )
    session.commit()
