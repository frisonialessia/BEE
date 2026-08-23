"""Organization-level settings — currently just the ICP (Ideal Customer
Profile) criteria that drives the fit × intent priority matrix.

Deliberately narrow: this is not a general org-settings endpoint. Reading
the ICP is open to any authenticated user (the whole team should see the
same definition of "a good fit"); setting it is an org-admin action, same
authority level as creating a team or a user.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.user import User
from app.schemas.organization import ICPCriteriaIn, ICPCriteriaOut

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
    return ICPCriteriaOut(**org.icp_criteria)
