"""DynamicSequence API endpoints — sequence management and execution.

Tenant boundary
----------------
Every route requires a resolvable caller identity (JWT session or
``X-BEE-Org-Key``) and scopes every query/mutation to that organization —
sequence executions drive real outreach (PendingActions), so there is no
legitimate "unscoped" caller here, same rationale as the orchestrator
endpoints.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_organization_id
from app.core.database import get_session
from app.schemas.sequence import (
    AdvanceResult,
    BulkExecutionCreate,
    BulkExecutionResult,
    ExecutionAdvance,
    ExecutionCreate,
    ExecutionOut,
    SequenceCreate,
    SequenceOut,
)
from app.services.dynamic_sequence import DynamicSequenceEngine

router = APIRouter(prefix="/sequences", tags=["Dynamic Sequences (State-Machine Outreach)"])


def _get_engine(session: Session = Depends(get_session)) -> DynamicSequenceEngine:
    return DynamicSequenceEngine(session)


def _require_organization_id(
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> uuid.UUID:
    """Require a resolvable tenant identity for this request (see module docstring)."""
    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required (Bearer token or X-BEE-Org-Key).",
        )
    return organization_id


@router.post(
    "",
    response_model=SequenceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a dynamic outreach sequence",
)
def create_sequence(
    data: SequenceCreate,
    engine: DynamicSequenceEngine = Depends(_get_engine),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> SequenceOut:
    """Define a new state-machine based outreach sequence.

    Each step contains:
    * ``action``: what to do (send_email, linkedin_connect, book_meeting)
    * ``transitions``: conditions that determine the NEXT step

    Example conditions:
    * ``email_opened`` — proceed when lead opens the email
    * ``link_clicked_AND_NOT_replied`` — link was clicked but no reply yet
    * ``not_opened_3d`` — email not opened after 3 days (timeout)
    """
    seq = engine.create_sequence(data, organization_id=organization_id)
    session.commit()
    session.refresh(seq)
    return SequenceOut.model_validate(seq)


@router.get(
    "",
    response_model=list[SequenceOut],
    summary="List all sequence definitions",
)
def list_sequences(
    limit: int = Query(default=20, le=100),
    engine: DynamicSequenceEngine = Depends(_get_engine),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> list[SequenceOut]:
    seqs = engine.list_sequences(limit=limit, organization_id=organization_id)
    return [SequenceOut.model_validate(s) for s in seqs]


@router.get(
    "/executions",
    response_model=list[ExecutionOut],
    summary="List sequence executions",
)
def list_executions(
    sequence_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=200),
    engine: DynamicSequenceEngine = Depends(_get_engine),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> list[ExecutionOut]:
    execs = engine.list_executions(
        sequence_id=sequence_id,
        status=status_filter,
        limit=limit,
        organization_id=organization_id,
    )
    return [ExecutionOut.model_validate(e) for e in execs]


@router.get(
    "/{sequence_id}",
    response_model=SequenceOut,
    summary="Get a sequence definition",
)
def get_sequence(
    sequence_id: uuid.UUID,
    engine: DynamicSequenceEngine = Depends(_get_engine),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> SequenceOut:
    seq = engine.get_sequence(sequence_id, organization_id=organization_id)
    if not seq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sequence not found")
    return SequenceOut.model_validate(seq)


@router.post(
    "/executions",
    response_model=ExecutionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Start a sequence execution for a lead/opportunity",
)
def start_execution(
    data: ExecutionCreate,
    engine: DynamicSequenceEngine = Depends(_get_engine),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> ExecutionOut:
    """Start running a sequence for a specific lead or opportunity.

    Immediately creates the first PendingAction for the entry step.
    The CEO approves it → action fires → lead engages → you record the event
    → sequence advances to the next step.
    """
    try:
        execution = engine.start_execution(data, organization_id=organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    session.commit()
    session.refresh(execution)
    return ExecutionOut.model_validate(execution)


@router.post(
    "/executions/bulk",
    response_model=BulkExecutionResult,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll several leads into one sequence",
)
def bulk_start_execution(
    data: BulkExecutionCreate,
    engine: DynamicSequenceEngine = Depends(_get_engine),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> BulkExecutionResult:
    """The "Enviar a secuencia" bulk action from the Leads directory —
    same PendingAction-per-entry-step contract as start_execution, just run
    once per selected lead. A lead failing (already enrolled, bad state)
    never aborts the rest of the batch — see BulkExecutionResult.
    """
    try:
        result = engine.bulk_start_execution(data.sequence_id, data.lead_ids, organization_id=organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    session.commit()
    return result


@router.get(
    "/executions/{execution_id}",
    response_model=ExecutionOut,
    summary="Get a sequence execution state",
)
def get_execution(
    execution_id: uuid.UUID,
    engine: DynamicSequenceEngine = Depends(_get_engine),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> ExecutionOut:
    exec_ = engine.get_execution(execution_id, organization_id=organization_id)
    if not exec_:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execution not found")
    return ExecutionOut.model_validate(exec_)


@router.post(
    "/executions/{execution_id}/advance",
    response_model=AdvanceResult,
    summary="Record an engagement event and advance the sequence",
)
def advance_execution(
    execution_id: uuid.UUID,
    body: ExecutionAdvance,
    engine: DynamicSequenceEngine = Depends(_get_engine),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(_require_organization_id),
) -> AdvanceResult:
    """Record an engagement event and evaluate if the sequence should advance.

    The event is checked against the current step's transitions. If a condition
    matches, the sequence advances and a new PendingAction is created for the
    next step. If no condition matches, the execution stays at the current step
    (waiting for more events).

    Common events:
    * ``email_opened`` — email was opened
    * ``link_clicked`` — link in email was clicked
    * ``replied`` — lead replied
    * ``linkedin_accepted`` — connection request accepted
    * ``meeting_booked`` — meeting scheduled
    """
    try:
        result = engine.advance(execution_id, body.event, body.metadata, organization_id=organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    session.commit()
    return result
