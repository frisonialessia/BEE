"""Autopilot guardrails — per-organization autonomous-execution config.

Deliberately OWNER-only to write (stricter than the OWNER/ADMIN bar most
org settings use here): enabling autopilot changes whether outbound actions
can skip human approval, the single highest-consequence toggle in this
codebase. Reading is open to any authenticated user in the org — everyone
approving actions should be able to see whether autopilot is active and
what it's configured to do.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.user import User
from app.schemas.autopilot import (
    AutopilotConfigIn,
    AutopilotConfigOut,
    AutopilotSimulationReport,
    AutopilotSimulationRequest,
)
from app.services.autopilot import AutopilotGuardrailService

router = APIRouter(prefix="/organizations/autopilot", tags=["Autopilot Guardrails"])

_DEFAULTS = AutopilotConfigOut(
    enabled=False, confidence_threshold=0.9, excluded_company_ids=[], forbidden_words=[]
)


@router.get("", response_model=AutopilotConfigOut, summary="Get the organization's autopilot config")
def get_autopilot_config(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AutopilotConfigOut:
    """Never configured reads the same as "configured, everything at its
    default" — same "empty = not configured yet" rule as ICPCriteriaOut."""
    config = AutopilotGuardrailService(session).get_config(current_user.organization_id)
    if config is None:
        return _DEFAULTS
    return AutopilotConfigOut.model_validate(config)


@router.put("", response_model=AutopilotConfigOut, summary="Set the organization's autopilot config (OWNER only)")
def set_autopilot_config(
    data: AutopilotConfigIn,
    current_user: User = Depends(require_roles(UserRole.OWNER)),
    session: Session = Depends(get_session),
) -> AutopilotConfigOut:
    svc = AutopilotGuardrailService(session)
    config = svc.create_or_update(current_user.organization_id, data)
    session.commit()
    session.refresh(config)
    return AutopilotConfigOut.model_validate(config)


@router.post(
    "/simulate",
    response_model=AutopilotSimulationReport,
    summary="Backtest a candidate autopilot config against this org's history (OWNER/ADMIN only)",
)
def simulate_autopilot_config(
    data: AutopilotSimulationRequest,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> AutopilotSimulationReport:
    """Read-only — never persists ``data``, never touches a PendingAction.
    Answer the question a org owner actually has before raising
    ``confidence_threshold`` in production: "what would this have done to
    my last N days of opportunities?" See
    ``AutopilotGuardrailService.run_simulation`` for the full replay logic
    and its two documented data limitations.
    """
    return AutopilotGuardrailService(session).run_simulation(current_user.organization_id, data)
