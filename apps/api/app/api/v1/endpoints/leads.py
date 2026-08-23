"""Lead endpoints — read-only for now.

Leads are created via signal ingestion (get-or-create resolution — see
``app.repositories.lead.LeadRepository.get_or_create_from_ref``), not through
this API. This module exposes the list/detail views the dashboard needs, with
the same visibility scoping as ``GET /opportunities``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user_optional
from app.core.database import get_session
from app.models.user import User
from app.repositories.lead import LeadRepository
from app.schemas.lead import LeadOut
from app.services.permissions import get_visible_user_ids, user_can_view_assignment

router = APIRouter(prefix="/leads", tags=["Leads"])


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

    if current_user is not None and (
        (lead.organization_id is not None and lead.organization_id != current_user.organization_id)
        or not user_can_view_assignment(session, current_user, lead.assigned_to_user_id)
    ):
        # 404, not 403 — a MEMBER (or a user from another org) shouldn't
        # learn that a lead they can't see exists at all just by guessing ids.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    return LeadOut.model_validate(lead)
