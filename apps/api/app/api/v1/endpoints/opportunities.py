"""Opportunity endpoints.

Exposes the battlecard — BEE's flagship output: a fully synthesized, CEO-ready
sales brief assembled from lead + signal + generated strategy, returned in a
single HTTP call with no post-processing required by the frontend.

New endpoints in this release:
* ``PATCH /{id}/outcome`` — record WON/LOST (triggers FeedbackLoopService)
* ``GET  /{id}/artifacts`` — get or generate execution artifacts (ExecutiveAgent)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.models.base import OpportunityStatus
from app.repositories.opportunity import OpportunityRepository
from app.schemas.executive import ArtifactBundle
from app.schemas.feedback import OutcomeIn
from app.schemas.predictor import OutcomeWithPrediction
from app.schemas.strategy import (
    BattlecardCompany,
    BattlecardLead,
    BattlecardOut,
    BattlecardSignal,
    StrategySchema,
)
from app.services.executive_agent.service import ExecutiveAgent
from app.services.feedback_loop.service import FeedbackLoopService
from app.services.resource_predictor import ResourcePredictorService
from app.services.workflow_orchestrator import BeeEvent, WorkflowOrchestrator

router = APIRouter(prefix="/opportunities", tags=["Opportunities"])


@router.get(
    "",
    response_model=list[dict],
    summary="List opportunities ready to action",
)
def list_opportunities(
    opp_status: str | None = Query(default=None, alias="status"),
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
) -> list[dict]:
    """Return opportunities, defaulting to READY_TO_ACTION sorted by score."""
    repo = OpportunityRepository(session)
    if opp_status is None or opp_status == "ready_to_action":
        items = repo.list_ready_to_action(limit=limit, offset=offset)
    else:
        items = repo.list(limit=limit, offset=offset)

    return [
        {
            "id": str(item.id),
            "title": item.title,
            "status": str(item.status.value if hasattr(item.status, "value") else item.status),
            "score": item.score,
            "signal_id": str(item.signal_id) if item.signal_id else None,
            "lead_id": str(item.lead_id) if item.lead_id else None,
            "company_id": str(item.company_id) if item.company_id else None,
            "hot_lead": (item.strategy or {}).get("hot_lead", False),
        }
        for item in items
    ]


@router.get(
    "/{opportunity_id}/battlecard",
    response_model=BattlecardOut,
    summary="Get the CEO battlecard for an opportunity",
)
def get_battlecard(
    opportunity_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> BattlecardOut:
    """Return the fully synthesized battlecard for a single opportunity.

    The response bundles company context, lead context, the originating signal,
    and the complete generated strategy (pain_point, closing_argument,
    timing_window) — ready for the dashboard to render without further API calls
    or data transformation.

    ``ready_to_action`` is ``True`` only when the strategy is complete. The
    endpoint returns the battlecard regardless of status so the frontend can
    display in-progress cards with a clear incomplete state.
    """
    repo = OpportunityRepository(session)
    result = repo.get_with_relations(opportunity_id)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found.",
        )

    opportunity, signal, company, lead = result

    strategy_dict = opportunity.strategy or {}
    try:
        strategy = StrategySchema.model_validate(strategy_dict)
    except Exception:
        strategy = StrategySchema(
            pain_point=strategy_dict.get("pain_point", ""),
            closing_argument=strategy_dict.get("closing_argument", ""),
            timing_window={  # type: ignore[arg-type]
                "urgency": "watch",
                "reason": "Strategy is being generated.",
            },
            playbook=strategy_dict.get("playbook", "generic_outreach"),
            next_best_action=strategy_dict.get("next_best_action", "monitor"),
            channel=strategy_dict.get("channel", "email"),
        )

    signal_out = BattlecardSignal(
        id=signal.id if signal else uuid.uuid4(),
        signal_type=str(signal.signal_type.value if signal else "other"),
        title=signal.title if signal else opportunity.title,
        description=signal.description if signal else None,
        score=signal.score if signal else 0.0,
        detected_at=signal.detected_at if signal else opportunity.created_at,
        tags=(signal.analysis or {}).get("tags", []) if signal else [],
    )

    company_out = BattlecardCompany(
        name=company.name if company else None,
        domain=company.domain if company else None,
        industry=company.industry if company else None,
        country=company.country if company else None,
    )

    lead_out = BattlecardLead(
        full_name=lead.full_name if lead else None,
        title=lead.title if lead else None,
        email=lead.email if lead else None,
        seniority=lead.seniority if lead else None,
        linkedin_url=lead.linkedin_url if lead else None,
    )

    return BattlecardOut(
        opportunity_id=opportunity.id,
        title=opportunity.title,
        status=str(
            opportunity.status.value
            if hasattr(opportunity.status, "value")
            else opportunity.status
        ),
        score=opportunity.score,
        ready_to_action=opportunity.status == OpportunityStatus.READY_TO_ACTION,
        hot_lead=strategy_dict.get("hot_lead", False),
        manual_review_required=strategy_dict.get("manual_review_required", False),
        company=company_out,
        lead=lead_out,
        signal=signal_out,
        strategy=strategy,
        created_at=opportunity.created_at,
        updated_at=opportunity.updated_at,
    )


@router.patch(
    "/{opportunity_id}/outcome",
    response_model=OutcomeWithPrediction,
    summary="Record WON/LOST outcome (resource gate + event bus + adaptive learning)",
)
def record_outcome(
    opportunity_id: uuid.UUID,
    body: OutcomeIn,
    session: Session = Depends(get_session),
) -> OutcomeWithPrediction:
    """Mark an opportunity as WON or LOST.

    **When outcome = WON**, the request goes through three layers:

    1. **Resource Gate** (opt-in, ``RESOURCE_PREDICTION_ENABLED``): evaluates
       operational impact. In STRICT mode, HIGH-risk deals block confirmation.

    2. **FeedbackLoopService**: records the outcome, updates the opportunity
       status, and trains the adaptive learning system.

    3. **WorkflowOrchestrator**: publishes an ``opportunity.won`` event that
       triggers all registered handlers (CRM update, service delivery, billing).
       Handlers run in mock mode if URLs are not configured.
    """
    from app.core.config import get_settings
    settings = get_settings()

    # ── Step 1: Resource Gate (opt-in) ────────────────────────────────────────
    prediction = None
    if body.outcome == "won" and settings.RESOURCE_PREDICTION_ENABLED:
        repo = OpportunityRepository(session)
        opp = repo.get(opportunity_id)
        if opp is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

        predictor = ResourcePredictorService()
        prediction = predictor.predict(opp)

        if settings.RESOURCE_PREDICTION_STRICT and prediction.blocks_confirmation:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "resource_conflict",
                    "message": prediction.summary,
                    "warnings": prediction.warnings,
                    "recommended_actions": prediction.recommended_actions,
                },
            )

    # ── Step 2: Record outcome ─────────────────────────────────────────────────
    svc = FeedbackLoopService(session)
    try:
        outcome_out = svc.record_outcome(opportunity_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    # ── Step 3: Publish event to WorkflowOrchestrator ─────────────────────────
    workflow_tasks_dispatched = 0
    if body.outcome == "won":
        try:
            # Resolve company name for the event payload
            repo2 = OpportunityRepository(session)
            opp2 = repo2.get(opportunity_id)
            company_name = None
            if opp2 and opp2.company_id:
                from app.models.company import Company
                co = session.get(Company, opp2.company_id)
                company_name = co.name if co else None

            event = BeeEvent(
                event_type="opportunity.won",
                entity_id=opportunity_id,
                entity_type="opportunity",
                payload={
                    "opportunity_id": str(opportunity_id),
                    "company_name": company_name,
                    "score": opp2.score if opp2 else 0,
                    "notes": body.notes,
                },
            )
            orchestrator = WorkflowOrchestrator(session)
            tasks = orchestrator.publish(event)
            session.commit()
            workflow_tasks_dispatched = len(tasks)
        except Exception:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).exception("WorkflowOrchestrator dispatch failed for opp %s", opportunity_id)

    # ── Step 4: Trigger AnomalyDetector after every outcome ───────────────────
    # Run automatically (non-blocking) so the CEO is alerted if this outcome
    # creates a statistically significant conversion-rate anomaly.
    _trigger_anomaly_check(session)

    return OutcomeWithPrediction(
        opportunity_id=str(outcome_out.opportunity_id),
        outcome=outcome_out.outcome,
        closed_at=outcome_out.closed_at.isoformat(),
        message=outcome_out.message,
        resource_prediction=prediction,
        workflow_tasks_dispatched=workflow_tasks_dispatched,
    )


def _trigger_anomaly_check(session: Session) -> None:
    """Run AnomalyDetector non-blocking after every outcome recording.

    Errors are swallowed so a detector failure never blocks the outcome call.
    Any alerts generated create ``PendingAction`` records for the CEO.
    """
    try:
        from app.services.anomaly_detector.service import AnomalyDetector

        detector = AnomalyDetector(session)
        result = detector.check_all()
        if result.alerts_created > 0:
            import logging
            logging.getLogger(__name__).info(
                "AnomalyDetector: %d new alert(s) created after outcome recording",
                result.alerts_created,
            )
    except Exception:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).exception(
            "AnomalyDetector post-outcome check failed — outcome was recorded successfully"
        )


@router.get(
    "/{opportunity_id}/artifacts",
    response_model=ArtifactBundle,
    summary="Get (or generate) execution artifacts for an opportunity",
)
def get_artifacts(
    opportunity_id: uuid.UUID,
    force: bool = Query(default=False, description="Force re-generation even if cached"),
    session: Session = Depends(get_session),
) -> ArtifactBundle:
    """Return the execution artifact bundle for an opportunity.

    On first call, the ExecutiveAgent generates: email draft, meeting agenda,
    and next steps. The result is cached in ``opportunity.execution_artifacts``
    and returned instantly on subsequent calls (unless ``force=true``).

    When artifacts are generated, BEE fires a webhook to ``WEBHOOK_EXECUTION_URL``
    (if configured) so n8n / Zapier can execute the email send, CRM update, etc.
    """
    agent = ExecutiveAgent(session)
    try:
        return agent.get_or_generate(opportunity_id, force=force)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
