"""Lead endpoints.

Most leads are created via signal ingestion (get-or-create resolution — see
``app.repositories.lead.LeadRepository.get_or_create_from_ref``). ``POST /leads``
is the manual-entry counterpart for a rep adding a contact by hand. This
module exposes the list/detail/create views the dashboard needs, with the
same visibility scoping as ``GET /opportunities``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_session
from app.core.logging import get_logger
from app.models.lead import Lead
from app.models.user import User
from app.repositories.lead import LeadRepository
from app.schemas.lead import (
    LeadBulkCreateIn,
    LeadBulkError,
    LeadBulkResult,
    LeadCreateIn,
    LeadOut,
    LeadValidationOut,
)
from app.services.data_validator import DataValidator
from app.services.permissions import get_visible_user_ids, user_can_view_assignment

logger = get_logger(__name__)

router = APIRouter(prefix="/leads", tags=["Leads"])


@router.post(
    "",
    response_model=LeadOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a lead manually",
)
def create_lead(
    data: LeadCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LeadOut:
    lead = Lead(
        organization_id=current_user.organization_id,
        company_id=data.company_id,
        full_name=data.full_name,
        email=data.email,
        title=data.title,
        seniority=data.seniority,
        linkedin_url=data.linkedin_url,
        phone=data.phone,
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)
    _validate_new_lead(session, lead.id)
    session.refresh(lead)
    return LeadOut.model_validate(lead)


def _validate_new_lead(session: Session, lead_id: uuid.UUID) -> None:
    """Run DataValidator right after a lead is created — best-effort, the
    same way SignalEngine does it for leads resolved from a webhook. A
    validation failure must never fail the create request that triggered it."""
    try:
        DataValidator(session).validate_lead(lead_id)
        session.commit()
    except Exception:  # noqa: BLE001
        session.rollback()
        logger.exception("DataValidator failed for new lead %s", lead_id)


@router.post(
    "/bulk",
    response_model=LeadBulkResult,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-create leads (CSV import)",
)
def bulk_create_leads(
    data: LeadBulkCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LeadBulkResult:
    """CSV parsing happens in the browser — this just persists the rows it
    already validated. Each row is inserted independently so one bad row
    (e.g. a company_id that doesn't exist) doesn't fail the whole import.
    """
    created_count = 0
    errors: list[LeadBulkError] = []

    # Committed per row (not batched into one transaction) so a bad row
    # (e.g. a company_id that doesn't exist) can be rolled back on its own
    # without losing the rows already inserted earlier in the same import.
    for index, row in enumerate(data.leads):
        try:
            lead = Lead(
                organization_id=current_user.organization_id,
                company_id=row.company_id,
                full_name=row.full_name,
                email=row.email,
                title=row.title,
                seniority=row.seniority,
                linkedin_url=row.linkedin_url,
                phone=row.phone,
            )
            session.add(lead)
            session.commit()
            created_count += 1
        except Exception as exc:  # noqa: BLE001 - one bad row must not abort the batch
            session.rollback()
            errors.append(LeadBulkError(row=index, message=str(exc)))

    return LeadBulkResult(created_count=created_count, errors=errors)


@router.get(
    "",
    response_model=list[LeadOut],
    summary="List leads visible to the caller",
)
def list_leads(
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[LeadOut]:
    """Return a page of leads, most recent first.

    Same visibility contract as ``GET /opportunities``: unauthenticated/
    API-key-only requests are unrestricted (existing integrations keep
    working); a logged-in session token scopes results to what that user can
    see (org-wide for OWNER/ADMIN, team subtree for MANAGER, own assignments
    for MEMBER).
    """
    repo = LeadRepository(session)
    visible_user_ids = get_visible_user_ids(session, current_user) if current_user else None
    organization_id = current_user.organization_id if current_user else None
    leads = repo.list_scoped(
        limit=limit, offset=offset, visible_user_ids=visible_user_ids, organization_id=organization_id
    )
    return [LeadOut.model_validate(lead) for lead in leads]


def _hidden_from(session: Session, current_user: User | None, lead: Lead) -> bool:
    if current_user is None:
        return False
    return (
        lead.organization_id is not None and lead.organization_id != current_user.organization_id
    ) or not user_can_view_assignment(session, current_user, lead.assigned_to_user_id)


@router.get(
    "/{lead_id}",
    response_model=LeadOut,
    summary="Fetch a single lead by id",
)
def get_lead(
    lead_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> LeadOut:
    repo = LeadRepository(session)
    lead = repo.get(lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    if _hidden_from(session, current_user, lead):
        # 404, not 403 — a MEMBER (or a user from another org) shouldn't
        # learn that a lead they can't see exists at all just by guessing ids.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    return LeadOut.model_validate(lead)


@router.post(
    "/{lead_id}/validate",
    response_model=LeadValidationOut,
    summary="Re-run data quality checks against a lead on demand",
)
def validate_lead(
    lead_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> LeadValidationOut:
    """Re-check email/LinkedIn/title/staleness and refresh the quality score.

    New leads are already validated once at creation time (manual entry and
    signal ingestion both do this automatically) — this is for re-checking a
    lead later, e.g. after 90+ days, or after a rep edits its contact info.
    """
    repo = LeadRepository(session)
    lead = repo.get(lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    if _hidden_from(session, current_user, lead):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    report = DataValidator(session).validate_lead(lead_id)
    session.commit()
    return LeadValidationOut(
        lead_id=report.lead_id,
        flags=report.flags,
        freshness_score=report.freshness_score,
        stale_risk=report.stale_risk,
        validated_at=report.validated_at,
    )
