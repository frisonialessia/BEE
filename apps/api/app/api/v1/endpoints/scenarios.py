"""ScenarioSimulator API — What-If revenue projection endpoint."""

import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import require_organization_id
from app.core.database import get_session
from app.schemas.scenario import ScenarioRequest, ScenarioResult
from app.services.scenario_simulator import ScenarioSimulator

router = APIRouter(prefix="/analytics", tags=["Scenario Simulator (What-If)"])


@router.post(
    "/scenarios",
    response_model=ScenarioResult,
    summary="Run a What-If prospecting scenario simulation",
)
def run_scenario(
    request: ScenarioRequest,
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_id),
) -> ScenarioResult:
    """Execute a predictive revenue simulation.

    Uses historical win-rate data from ``FeedbackLoopService`` combined with
    learned modifiers (channel effectiveness, DISC style match, dark funnel heat)
    to project revenue outcomes under three scenarios:

    * **Conservative**: 70% of effective win rate (adverse conditions)
    * **Realistic**: effective win rate with all modifiers applied
    * **Optimistic**: 135% of effective win rate (strong execution)

    The response includes:
    - Revenue projections (monthly, quarterly, annual) for each scenario
    - Key win-rate drivers (what's making performance better)
    - Risk factors (what could cause underperformance)
    - Recommended actions (concrete next steps)
    - Data confidence indicator (low if < 5 historical data points)

    All simulations are logged to the AuditTrailService for full transparency.

    Example request:
    ```json
    {
      "sector": "fintech",
      "signal_type": "funding_round",
      "channel": "warm_intro",
      "psychographic_style": "C",
      "target_monthly_signals": 15,
      "additional_prospecting_reps": 2,
      "dark_funnel_heat": 65
    }
    ```
    """
    simulator = ScenarioSimulator(session)
    result = simulator.run(request, organization_id)
    session.commit()
    return result
