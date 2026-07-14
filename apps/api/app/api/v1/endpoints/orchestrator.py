"""AgentOrchestrator endpoints.

These endpoints expose the execution action queue to external tools and the
approval interface for the CEO/rep dashboard.

Endpoint summary
----------------
GET  /pending-actions              — poll for actions needing approval (n8n/Zapier)
GET  /approved-actions             — poll for approved actions ready to execute
GET  /status                       — queue health summary
GET  /{id}                         — inspect a single action
POST /{id}/approve                 — human approval gate (REQUIRED before execution)
POST /{id}/reject                  — reject without execution
POST /{id}/start-execution         — mark as executing (called by the external tool)
POST /{id}/complete                — mark as completed
POST /{id}/fail                    — mark as failed (optionally requeue)
GET  /opportunity/{opp_id}/actions — all actions for a specific opportunity
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.orchestrator import (
    ApprovalIn,
    ExecutionCompleteIn,
    ExecutionFailedIn,
    ExecutionStartIn,
    OrchestratorStatusOut,
    PendingActionOut,
    RejectionIn,
)
from app.services.orchestrator import AgentOrchestrator

router = APIRouter(prefix="/orchestrator", tags=["AgentOrchestrator"])


def _get_orchestrator(session: Session = Depends(get_session)) -> AgentOrchestrator:
    return AgentOrchestrator(session)


@router.get(
    "/pending-actions",
    response_model=list[PendingActionOut],
    summary="List actions pending human approval (n8n/Zapier polling endpoint)",
)
def list_pending_actions(
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> list[PendingActionOut]:
    """Return all actions waiting for explicit human approval.

    This is the primary polling endpoint for external tools. n8n/Zapier should
    poll this every N minutes and display the queue in the approval dashboard.

    **Security**: Actions listed here are NOT yet executable. Each action must
    be explicitly approved via ``POST /{id}/approve`` before any external system
    can act on it.
    """
    actions = orchestrator.get_pending(limit=limit, offset=offset)
    return [PendingActionOut.model_validate(a) for a in actions]


@router.get(
    "/approved-actions",
    response_model=list[PendingActionOut],
    summary="List approved actions ready for external tool execution",
)
def list_approved_actions(
    limit: int = Query(default=50, le=200),
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> list[PendingActionOut]:
    """Return all approved actions ready to be executed by external tools.

    External tools should poll this, pick up approved actions, call
    ``POST /{id}/start-execution`` when they begin, and
    ``POST /{id}/complete`` or ``POST /{id}/fail`` when done.
    """
    actions = orchestrator.get_approved(limit=limit)
    return [PendingActionOut.model_validate(a) for a in actions]


@router.get(
    "/status",
    response_model=OrchestratorStatusOut,
    summary="Orchestrator queue health summary",
)
def get_status(
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> OrchestratorStatusOut:
    return orchestrator.get_status()


@router.get(
    "/opportunity/{opportunity_id}/actions",
    response_model=list[PendingActionOut],
    summary="List all actions for a specific opportunity",
)
def list_opportunity_actions(
    opportunity_id: uuid.UUID,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> list[PendingActionOut]:
    actions = orchestrator.get_by_opportunity(opportunity_id)
    return [PendingActionOut.model_validate(a) for a in actions]


@router.get(
    "/{action_id}",
    response_model=PendingActionOut,
    summary="Inspect a single action",
)
def get_action(
    action_id: uuid.UUID,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> PendingActionOut:
    from app.repositories.pending_action import PendingActionRepository

    repo = PendingActionRepository(orchestrator.session)
    action = repo.get(action_id)
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    return PendingActionOut.model_validate(action)


@router.post(
    "/{action_id}/approve",
    response_model=PendingActionOut,
    summary="Approve an action for execution (explicit human approval required)",
)
def approve_action(
    action_id: uuid.UUID,
    body: ApprovalIn,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> PendingActionOut:
    """Explicitly approve a pending action.

    This is the security gate. Only after this call can an external tool begin
    executing the action. The ``approved_by`` field records who approved it for
    audit trail purposes.
    """
    try:
        action = orchestrator.approve(action_id, body)
        return PendingActionOut.model_validate(action)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post(
    "/{action_id}/reject",
    response_model=PendingActionOut,
    summary="Reject a pending action (no execution will occur)",
)
def reject_action(
    action_id: uuid.UUID,
    body: RejectionIn,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> PendingActionOut:
    try:
        action = orchestrator.reject(action_id, body)
        return PendingActionOut.model_validate(action)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post(
    "/{action_id}/start-execution",
    response_model=PendingActionOut,
    summary="Mark action as executing (called by the external tool after approval)",
)
def start_execution(
    action_id: uuid.UUID,
    body: ExecutionStartIn,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> PendingActionOut:
    try:
        action = orchestrator.start_execution(action_id, body)
        return PendingActionOut.model_validate(action)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post(
    "/{action_id}/complete",
    response_model=PendingActionOut,
    summary="Mark an executing action as completed",
)
def complete_action(
    action_id: uuid.UUID,
    body: ExecutionCompleteIn,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> PendingActionOut:
    try:
        action = orchestrator.complete(action_id, body)
        return PendingActionOut.model_validate(action)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post(
    "/{action_id}/fail",
    response_model=PendingActionOut,
    summary="Mark an executing action as failed (optionally requeue for retry)",
)
def fail_action(
    action_id: uuid.UUID,
    body: ExecutionFailedIn,
    orchestrator: AgentOrchestrator = Depends(_get_orchestrator),
) -> PendingActionOut:
    """Report an action as failed.

    Set ``retry: true`` to requeue the action as PENDING_APPROVAL for another
    attempt (up to 3 retries). After 3 failures, the action remains in FAILED
    state permanently.
    """
    try:
        action = orchestrator.fail(action_id, body)
        return PendingActionOut.model_validate(action)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
