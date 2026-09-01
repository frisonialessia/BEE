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

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_session
from app.models.company import Company
from app.models.user import User
from app.repositories.company import CompanyRepository
from app.schemas.company import CompanyCreateIn, CompanyOut
from app.schemas.dedup import CompanyDuplicateGroup, MergeIn

router = APIRouter(prefix="/companies", tags=["Companies"])


@router.post(
    "",
    response_model=CompanyOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a company manually",
)
def create_company(
    data: CompanyCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CompanyOut:
    """The manual-entry counterpart to ``get_or_create_from_ref`` (which only
    runs during signal ingestion) — any authenticated user can add a company
    by hand, same as any real CRM lets a rep type one in.
    """
    company = Company(
        organization_id=current_user.organization_id,
        name=data.name,
        domain=data.domain,
        industry=data.industry,
        size=data.size,
        country=data.country,
        revenue_range=data.revenue_range,
        website=data.website,
        description=data.description,
    )
    session.add(company)
    session.commit()
    session.refresh(company)
    return CompanyOut.model_validate(company)


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
    "/duplicates",
    response_model=list[CompanyDuplicateGroup],
    summary="Find likely-duplicate companies (same domain or name)",
)
def list_duplicate_companies(
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[CompanyDuplicateGroup]:
    """Registered before ``/{company_id}`` on purpose — a static path segment
    must come before a dynamic one, or Starlette matches "duplicates" as a
    company_id and fails UUID validation before this handler ever runs."""
    repo = CompanyRepository(session)
    organization_id = current_user.organization_id if current_user else None
    groups = repo.find_duplicate_groups(organization_id)
    return [
        CompanyDuplicateGroup(key=key, companies=[CompanyOut.model_validate(c) for c in items])
        for key, items in groups
    ]


@router.post(
    "/merge",
    response_model=CompanyOut,
    summary="Merge one duplicate company into another",
)
def merge_companies(
    body: MergeIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CompanyOut:
    """Repoints every lead/opportunity/signal from ``merge_id`` onto
    ``keep_id`` and deletes ``merge_id``. Both companies must belong to the
    caller's organization — this isn't a superpower for touching other
    tenants' data."""
    repo = CompanyRepository(session)
    for company_id in (body.keep_id, body.merge_id):
        company = repo.get(company_id)
        if company is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
        if company.organization_id is not None and company.organization_id != current_user.organization_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    try:
        merged = repo.merge(body.keep_id, body.merge_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    session.commit()
    session.refresh(merged)
    return CompanyOut.model_validate(merged)


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
