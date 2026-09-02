"""Organization-level settings — the ICP (Ideal Customer Profile) criteria
that drives the fit × intent priority matrix, and the organization's own
company profile (industry / employee range / website).

Deliberately narrow: this is not a general org-settings endpoint. Reading is
open to any authenticated user (the whole team should see the same
definition of "a good fit", or who they work for); writing either one is an
org-admin action, same authority level as creating a team or a user.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.user import User
from app.schemas.organization import (
    ICPCriteriaIn,
    ICPCriteriaOut,
    OrganizationProfileIn,
    OrganizationProfileOut,
)
from app.services.events import publish

router = APIRouter(prefix="/organizations", tags=["Organizations"])


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
    publish("icp_criteria.updated", session=session, organization_id=org.id)
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
