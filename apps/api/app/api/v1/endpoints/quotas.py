"""Revenue quotas — a target per rep or per team over a period.

Territory management reuses the existing Team hierarchy rather than a
separate model — see app.models.quota's docstring. Setting a quota is an
org-admin action (same authority level as creating a team or a user);
viewing quotas is open to any authenticated user, since a rep should be
able to see their own target without needing elevated permissions.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user_optional, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.quota import Quota
from app.models.user import User
from app.schemas.quota import QuotaCreateIn, QuotaOut, QuotaUpdateIn
from app.services.permissions import scope_by_organization_id

router = APIRouter(prefix="/quotas", tags=["Quotas"])


@router.post(
    "",
    response_model=QuotaOut,
    status_code=status.HTTP_201_CREATED,
    summary="Set a revenue quota for a rep or a team",
)
def create_quota(
    data: QuotaCreateIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> QuotaOut:
    quota = Quota(
        organization_id=current_user.organization_id,
        user_id=data.user_id,
        team_id=data.team_id,
        period_start=data.period_start,
        period_end=data.period_end,
        target_amount=data.target_amount,
    )
    session.add(quota)
    session.commit()
    session.refresh(quota)
    return QuotaOut.model_validate(quota)


@router.get(
    "",
    response_model=list[QuotaOut],
    summary="List quotas visible to the caller",
)
def list_quotas(
    limit: int = 200,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[QuotaOut]:
    statement = select(Quota).order_by(Quota.period_start.desc())  # type: ignore[union-attr]
    organization_id = current_user.organization_id if current_user else None
    statement = scope_by_organization_id(statement, Quota.organization_id, organization_id)
    statement = statement.limit(limit).offset(offset)
    quotas = list(session.exec(statement).all())
    return [QuotaOut.model_validate(q) for q in quotas]


@router.patch(
    "/{quota_id}",
    response_model=QuotaOut,
    summary="Update a quota's period or target amount",
)
def update_quota(
    quota_id: uuid.UUID,
    data: QuotaUpdateIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> QuotaOut:
    quota = session.get(Quota, quota_id)
    if quota is None or (
        quota.organization_id is not None and quota.organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quota not found.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(quota, field, value)

    session.add(quota)
    session.commit()
    session.refresh(quota)
    return QuotaOut.model_validate(quota)


@router.delete(
    "/{quota_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a quota",
)
def delete_quota(
    quota_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> None:
    quota = session.get(Quota, quota_id)
    if quota is None or (
        quota.organization_id is not None and quota.organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quota not found.")

    session.delete(quota)
    session.commit()
