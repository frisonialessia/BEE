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
from app.models.account_activity import AccountActivityEventType
from app.models.company import Company
from app.models.user import User
from app.repositories.company import CompanyRepository
from app.schemas.account_activity import AccountActivityEventOut
from app.schemas.company import CompanyCreateIn, CompanyOut, CompanyUpdateIn
from app.schemas.dedup import CompanyDuplicateGroup, MergeIn
from app.services.account_activity import list_events_for_company, record_event
from app.services.permissions import get_visible_user_ids, user_can_view_assignment

router = APIRouter(prefix="/companies", tags=["Companies"])


def _hidden_from(session: Session, current_user: User | None, company: Company) -> bool:
    """Same 404-not-403 visibility check as ``leads.py``'s ``_hidden_from``,
    applied to ``owner_user_id`` instead of ``assigned_to_user_id``."""
    if current_user is None:
        return False
    return (
        company.organization_id is not None
        and company.organization_id != current_user.organization_id
    ) or not user_can_view_assignment(session, current_user, company.owner_user_id)


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

    Same visibility contract as ``GET /leads``: unauthenticated/API-key-only
    requests are unrestricted (existing integrations keep working); a
    logged-in session token scopes results to what that user can see
    (org-wide for OWNER/ADMIN, team subtree for MANAGER, own assigned
    accounts for MEMBER).
    """
    repo = CompanyRepository(session)
    visible_user_ids = get_visible_user_ids(session, current_user) if current_user else None
    organization_id = current_user.organization_id if current_user else None
    companies = repo.list_scoped(
        limit=limit,
        offset=offset,
        visible_user_ids=visible_user_ids,
        organization_id=organization_id,
    )
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
    if _hidden_from(session, current_user, company):
        # 404, not 403 — a MEMBER (or a user from another org) shouldn't
        # learn that a company they can't see exists at all just by
        # guessing ids. Same rationale as GET /leads/{lead_id}.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if current_user is not None:
        record_event(
            session,
            organization_id=current_user.organization_id,
            company_id=company.id,
            user_id=current_user.id,
            event_type=AccountActivityEventType.VIEWED,
        )
    return CompanyOut.model_validate(company)


@router.get(
    "/{company_id}/activity",
    response_model=list[AccountActivityEventOut],
    summary="Recent activity on this account — who viewed/edited/reassigned it, and when",
)
def get_company_activity(
    company_id: uuid.UUID,
    limit: int = 20,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[AccountActivityEventOut]:
    repo = CompanyRepository(session)
    company = repo.get(company_id)
    if company is None or _hidden_from(session, current_user, company):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    rows = list_events_for_company(session, company_id, limit=limit)
    return [
        AccountActivityEventOut(
            id=event.id,
            company_id=event.company_id,
            user_id=event.user_id,
            user_full_name=user.full_name,
            user_avatar_url=user.avatar_url,
            event_type=event.event_type,
            created_at=event.created_at,
        )
        for event, user in rows
    ]


@router.patch(
    "/{company_id}",
    response_model=CompanyOut,
    summary="Edit a company, including reassigning its owner",
)
def update_company(
    company_id: uuid.UUID,
    data: CompanyUpdateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CompanyOut:
    repo = CompanyRepository(session)
    company = repo.get(company_id)
    if company is None or _hidden_from(session, current_user, company):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if data.owner_user_id is not None:
        # Reassigning to a user outside the caller's own org would silently
        # hide the company from everyone who can actually see it — same
        # cross-tenant guard as PATCH /users/{user_id}'s team_id check.
        owner = session.get(User, data.owner_user_id)
        if owner is None or owner.organization_id != current_user.organization_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    updates = data.model_dump(exclude_unset=True)
    reassigned = "owner_user_id" in updates and updates["owner_user_id"] != company.owner_user_id
    for field, value in updates.items():
        setattr(company, field, value)

    session.add(company)
    session.commit()
    session.refresh(company)

    record_event(
        session,
        organization_id=current_user.organization_id,
        company_id=company.id,
        user_id=current_user.id,
        event_type=(
            AccountActivityEventType.ASSIGNED if reassigned else AccountActivityEventType.EDITED
        ),
    )
    return CompanyOut.model_validate(company)
