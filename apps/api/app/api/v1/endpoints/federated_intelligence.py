"""Federated Signal Intelligence — per-organization opt-in.

Same OWNER-only-to-write / open-to-read shape as autopilot guardrails
(see that endpoint's own docstring): opting in changes whether this
organization's own closed-deal history is counted toward other
organizations' cross-tenant priors, the highest-consequence data-sharing
toggle in this codebase, so it gets the same stricter bar. Reading is open
to any authenticated user in the org — anyone should be able to see
whether their organization participates.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.federated_intelligence import (
    FederatedIntelligenceConfigIn,
    FederatedIntelligenceConfigOut,
)

router = APIRouter(
    prefix="/organizations/federated-intelligence", tags=["Federated Signal Intelligence"]
)


@router.get(
    "",
    response_model=FederatedIntelligenceConfigOut,
    summary="Get this organization's federated intelligence opt-in status",
)
def get_federated_intelligence_config(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FederatedIntelligenceConfigOut:
    org = session.get(Organization, current_user.organization_id)
    opted_in = bool(org is not None and org.federated_intelligence_opt_in)
    return FederatedIntelligenceConfigOut(opt_in=opted_in)


@router.put(
    "",
    response_model=FederatedIntelligenceConfigOut,
    summary="Set this organization's federated intelligence opt-in (OWNER only)",
)
def set_federated_intelligence_config(
    data: FederatedIntelligenceConfigIn,
    current_user: User = Depends(require_roles(UserRole.OWNER)),
    session: Session = Depends(get_session),
) -> FederatedIntelligenceConfigOut:
    org = session.get(Organization, current_user.organization_id)
    if org is None:
        return FederatedIntelligenceConfigOut(opt_in=data.opt_in)

    org.federated_intelligence_opt_in = data.opt_in
    session.add(org)
    session.commit()
    session.refresh(org)
    return FederatedIntelligenceConfigOut(opt_in=org.federated_intelligence_opt_in)
