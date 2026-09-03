"""Organization-level settings — the ICP (Ideal Customer Profile) criteria
that drives the fit × intent priority matrix, the organization's own
company profile (industry / employee range / website), a GDPR data
export, and a deletion-request flow.

Deliberately narrow: this is not a general org-settings endpoint. Reading is
open to any authenticated user (the whole team should see the same
definition of "a good fit", or who they work for); writing either one is an
org-admin action, same authority level as creating a team or a user.

GDPR export/deletion-request (added later, see their own docstrings below)
------------------------------------------------------------------------
POST /organizations/me/deletion-request records a REQUEST — same
"OWNER-only, type-to-confirm, logged, never automatic" caution
``app.api.v1.endpoints.internal_support``'s emergency tool already applies
to a destructive action: cascading a real erasure safely across every
table an organization's data touches is a reviewed, audited support-team
action once the request lands, not something this one API call performs
itself.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.company import Company
from app.models.lead import Lead
from app.models.meeting import Meeting
from app.models.opportunity import Opportunity
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.company import CompanyOut
from app.schemas.lead import LeadOut
from app.schemas.meeting import MeetingOut
from app.schemas.organization import (
    DeletionRequestIn,
    DeletionRequestOut,
    ICPCriteriaIn,
    ICPCriteriaOut,
    OrganizationDataExport,
    OrganizationProfileIn,
    OrganizationProfileOut,
)
from app.schemas.signal import OpportunityOut
from app.services.admin_audit import AdminAuditService
from app.services.events import publish
from app.services.permissions import scope_by_organization_id

router = APIRouter(prefix="/organizations", tags=["Organizations"])

# Per-entity cap on GET /organizations/me/export — a real export shouldn't
# silently hang or time out on a large org; see that endpoint's own
# docstring for what happens when an org has more than this.
_EXPORT_LIMIT_PER_ENTITY = 5000


@router.get(
    "/icp",
    response_model=ICPCriteriaOut,
    summary="Get the organization's Ideal Customer Profile criteria",
)
def get_icp_criteria(
    current_user: User = Depends(get_current_user),
) -> ICPCriteriaOut:
    """Empty lists mean "not configured yet" — every consumer (the frontend's
    fit-score calculator included) must read that as "no opinion", not as
    "nothing matches"."""
    criteria = current_user.organization.icp_criteria or {}
    return ICPCriteriaOut(
        industries=criteria.get("industries", []),
        sizes=criteria.get("sizes", []),
        countries=criteria.get("countries", []),
        revenue_ranges=criteria.get("revenue_ranges", []),
        job_titles=criteria.get("job_titles", []),
        seniorities=criteria.get("seniorities", []),
        tech_keywords=criteria.get("tech_keywords", []),
    )


@router.put(
    "/icp",
    response_model=ICPCriteriaOut,
    summary="Set the organization's Ideal Customer Profile criteria",
)
def set_icp_criteria(
    data: ICPCriteriaIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> ICPCriteriaOut:
    org = current_user.organization
    org.icp_criteria = data.model_dump()
    session.add(org)
    session.commit()
    session.refresh(org)

    # New criteria can shift what "a good fit" means for every account at
    # once, not just one — see app.services.icp.recompute_org_fit_scores.
    # Also drives the admin audit log entry (app.services.events.listeners'
    # _on_icp_criteria_updated_audit_log) — actor_user_id is passed through
    # for that alone, the fit-score recompute listener ignores it.
    publish("icp_criteria.updated", session=session, organization_id=org.id, actor_user_id=current_user.id)
    session.commit()

    return ICPCriteriaOut(**org.icp_criteria)


@router.get(
    "/profile",
    response_model=OrganizationProfileOut,
    summary="Get the organization's own company profile",
)
def get_organization_profile(
    current_user: User = Depends(get_current_user),
) -> OrganizationProfileOut:
    org = current_user.organization
    return OrganizationProfileOut(
        industry=org.industry, employee_range=org.employee_range, website=org.website
    )


@router.put(
    "/profile",
    response_model=OrganizationProfileOut,
    summary="Set the organization's own company profile",
)
def set_organization_profile(
    data: OrganizationProfileIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> OrganizationProfileOut:
    """Partial patch: a field the caller didn't send keeps its current
    value (see OrganizationProfileIn's docstring for why) — so this reads
    ``exclude_unset`` rather than blind-overwriting with every field's
    default of None."""
    org = current_user.organization
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    session.add(org)
    session.commit()
    session.refresh(org)
    return OrganizationProfileOut(
        industry=org.industry, employee_range=org.employee_range, website=org.website
    )


@router.get(
    "/me/export",
    response_model=OrganizationDataExport,
    summary="Export this organization's core data (GDPR right of access, OWNER/ADMIN only)",
)
def export_organization_data(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> OrganizationDataExport:
    """Core entities only — users, leads, companies, opportunities,
    meetings — not literally every table this organization's data touches
    (signals, sequences, templates, integration metadata, ...). This is
    the personal/business data GDPR's right of access is actually about;
    an org with more than ``_EXPORT_LIMIT_PER_ENTITY`` records of any one
    kind gets a truncated export plus a ``truncated`` list naming which —
    contact support for a complete one rather than this endpoint silently
    hanging on an unbounded query.
    """
    org_id = current_user.organization_id
    truncated: list[str] = []

    def _capped(count: int, label: str) -> None:
        if count >= _EXPORT_LIMIT_PER_ENTITY:
            truncated.append(label)

    users = list(session.exec(select(User).where(User.organization_id == org_id)).all())

    leads = list(
        session.exec(
            scope_by_organization_id(select(Lead), Lead.organization_id, org_id).limit(_EXPORT_LIMIT_PER_ENTITY)
        ).all()
    )
    _capped(len(leads), "leads")

    companies = list(
        session.exec(
            scope_by_organization_id(select(Company), Company.organization_id, org_id).limit(
                _EXPORT_LIMIT_PER_ENTITY
            )
        ).all()
    )
    _capped(len(companies), "companies")

    opportunities = list(
        session.exec(
            scope_by_organization_id(select(Opportunity), Opportunity.organization_id, org_id).limit(
                _EXPORT_LIMIT_PER_ENTITY
            )
        ).all()
    )
    _capped(len(opportunities), "opportunities")

    meetings = list(
        session.exec(
            scope_by_organization_id(select(Meeting), Meeting.organization_id, org_id).limit(
                _EXPORT_LIMIT_PER_ENTITY
            )
        ).all()
    )
    _capped(len(meetings), "meetings")

    return OrganizationDataExport(
        organization_id=org_id,
        organization_name=current_user.organization.name,
        exported_at=datetime.now(UTC),
        users=[UserOut.model_validate(u) for u in users],
        leads=[LeadOut.model_validate(lead) for lead in leads],
        companies=[CompanyOut.model_validate(c) for c in companies],
        opportunities=[OpportunityOut.model_validate(o) for o in opportunities],
        meetings=[MeetingOut.model_validate(m) for m in meetings],
        truncated=truncated,
    )


@router.post(
    "/me/deletion-request",
    response_model=DeletionRequestOut,
    summary="Request deletion of this organization's data (GDPR right to erasure, OWNER only)",
)
def request_organization_deletion(
    data: DeletionRequestIn,
    current_user: User = Depends(require_roles(UserRole.OWNER)),
    session: Session = Depends(get_session),
) -> DeletionRequestOut:
    """Records the request — does NOT delete anything itself, see this
    module's own docstring for why. OWNER only (stricter than the
    OWNER/ADMIN bar the rest of this file uses) since this is the most
    consequential action an organization can take on itself."""
    org = current_user.organization
    if data.confirm_organization_name != org.name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="confirm_organization_name doesn't match this organization's name.",
        )

    org.deletion_requested_at = datetime.now(UTC)
    org.deletion_requested_by_user_id = current_user.id
    session.add(org)
    AdminAuditService(session).log(
        organization_id=org.id,
        actor_user_id=current_user.id,
        action="organization.deletion_requested",
        summary=f"{current_user.email} requested deletion of this organization's data.",
    )
    session.commit()

    return DeletionRequestOut(
        requested=True,
        requested_at=org.deletion_requested_at,
        requested_by_user_id=org.deletion_requested_by_user_id,
        detail=(
            "Deletion request received. Our team will action this within the legally required "
            "window — contact support if you need to cancel it before then."
        ),
    )


@router.delete(
    "/me/deletion-request",
    response_model=DeletionRequestOut,
    summary="Cancel a pending deletion request (OWNER only)",
)
def cancel_organization_deletion_request(
    current_user: User = Depends(require_roles(UserRole.OWNER)),
    session: Session = Depends(get_session),
) -> DeletionRequestOut:
    org = current_user.organization
    if org.deletion_requested_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending deletion request.")

    org.deletion_requested_at = None
    org.deletion_requested_by_user_id = None
    session.add(org)
    AdminAuditService(session).log(
        organization_id=org.id,
        actor_user_id=current_user.id,
        action="organization.deletion_request_cancelled",
        summary=f"{current_user.email} cancelled the pending deletion request.",
    )
    session.commit()

    return DeletionRequestOut(
        requested=False,
        requested_at=None,
        requested_by_user_id=None,
        detail="Deletion request cancelled.",
    )
