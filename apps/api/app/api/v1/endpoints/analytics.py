"""Analytics endpoints — RevenueSimulator, WorkflowOrchestrator status."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.simulator import RevenueSimulation
from app.schemas.workflow import WorkflowStatusOut, WorkflowTaskOut
from app.services.revenue_simulator import RevenueSimulator
from app.services.workflow_orchestrator.service import WorkflowOrchestrator

router = APIRouter(prefix="/analytics", tags=["Analytics & BOS"])


@router.get(
    "/simulator",
    response_model=RevenueSimulation,
    summary="Revenue impact simulator — project prospecting ROI",
)
def run_revenue_simulation(
    signal_type: str = Query(
        ...,
        description="Signal category to analyze (e.g. 'funding_round', 'hiring')",
        examples=["funding_round"],
    ),
    industry: str | None = Query(
        default=None,
        description="Industry filter (e.g. 'SaaS', 'Healthcare')",
    ),
    increase_factor: float = Query(
        default=2.0,
        ge=1.1,
        le=10.0,
        description="Prospecting volume multiplier (e.g. 2.0 = double outreach)",
    ),
    session: Session = Depends(get_session),
) -> RevenueSimulation:
    """Project the revenue impact of increasing prospecting in a specific segment.

    Uses real closed-deal win-rate data from the ``FeedbackLoopService`` to
    produce three scenarios: conservative (70% of expected), realistic (100%),
    and optimistic (130%).

    The ``data_confidence`` field tells you how reliable the projection is:
    * ``none``   — no historical data yet; close your first deals first.
    * ``low``    — < 5 deals; treat as directional only.
    * ``medium`` — 5-19 deals; reliable for planning.
    * ``high``   — ≥ 20 deals; strong signal, act on it.
    """
    simulator = RevenueSimulator(session)
    return simulator.simulate(
        signal_type=signal_type,
        industry=industry,
        increase_factor=increase_factor,
    )


@router.get(
    "/workflows",
    response_model=list[WorkflowTaskOut],
    summary="List recent workflow tasks dispatched by the event bus",
)
def list_workflow_tasks(
    limit: int = Query(default=50, le=200),
    entity_id: uuid.UUID | None = Query(default=None, description="Filter by entity (opportunity) ID"),
    session: Session = Depends(get_session),
) -> list[WorkflowTaskOut]:
    """Return recent workflow tasks for audit and monitoring.

    Tasks with ``mock=True`` were created without real external calls —
    configure the corresponding URL env var to activate live dispatch.
    """
    orch = WorkflowOrchestrator(session)
    if entity_id:
        tasks = orch.get_tasks_for_entity(entity_id)
    else:
        tasks = orch.get_recent_tasks(limit=limit)
    return [WorkflowTaskOut.model_validate(t) for t in tasks]


@router.get(
    "/workflows/status",
    response_model=WorkflowStatusOut,
    summary="Workflow bus health summary",
)
def workflow_status(session: Session = Depends(get_session)) -> WorkflowStatusOut:
    return WorkflowOrchestrator(session).get_status()


@router.get(
    "/workflows/handlers",
    summary="List all registered workflow handlers",
)
def list_workflow_handlers(session: Session = Depends(get_session)) -> list[dict]:
    """Return metadata about all registered workflow handlers and their event subscriptions."""
    return WorkflowOrchestrator(session).list_registered_handlers()
