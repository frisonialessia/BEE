"""Company (Empresa/Cuenta) endpoints — read-only.

Companies are created via signal ingestion (get-or-create resolution — see
``app.repositories.company.CompanyRepository.get_or_create_from_ref``), not
through this API. This module exposes the list/detail views the account
page needs, with the same organization-tenant boundary as ``GET /leads``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user_optional
from app.core.database import get_session
from app.models.user import User
from app.repositories.company import CompanyRepository
from app.schemas.company import CompanyOut

router = APIRouter(prefix="/companies", tags=["Companies"])


@router.get(
    "",
    response_model=list[CompanyOut],
    summary="List companies visible to the caller",
)
def list_companies(
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[CompanyOut]:
    """Return a page of companies, most recently created first.

    Same tenant contract as ``GET /leads``: unauthenticated/API-key-only
    requests are unrestricted; a logged-in session token scopes results to
    that user's organization.
    """
    repo = CompanyRepository(session)
    organization_id = current_user.organization_id if current_user else None
    companies = repo.list_scoped(limit=limit, offset=offset, organization_id=organization_id)
    return [CompanyOut.model_validate(c) for c in companies]


@router.get(
    "/{company_id}",
    response_model=CompanyOut,
    summary="Fetch a single company by id",
)
def get_company(
    company_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> CompanyOut:
    repo = CompanyRepository(session)
    company = repo.get(company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if (
        current_user is not None
        and company.organization_id is not None
        and company.organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return CompanyOut.model_validate(company)
