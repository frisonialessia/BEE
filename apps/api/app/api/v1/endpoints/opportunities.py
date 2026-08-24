"""Opportunity endpoints.

Exposes the battlecard — BEE's flagship output: a fully synthesized, CEO-ready
sales brief assembled from lead + signal + generated strategy, returned in a
single HTTP call with no post-processing required by the frontend.

New endpoints in this release:
* ``PATCH /{id}/outcome`` — record WON/LOST (triggers FeedbackLoopService)
* ``GET  /{id}/artifacts`` — get or generate execution artifacts (ExecutiveAgent)
* ``PATCH /{id}/stage`` — move between non-terminal pipeline stages (the CRM Kanban drag)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_current_user_optional
from app.core.database import get_session
from app.models.base import OpportunityStatus
from app.models.user import User
from app.repositories.opportunity import OpportunityRepository
from app.schemas.executive import ArtifactBundle
from app.schemas.feedback import OutcomeIn
from app.schemas.predictor import OutcomeWithPrediction
from app.schemas.signal import OpportunityOut, OpportunityStageIn, OpportunityUpdateIn
from app.schemas.strategy import (
    BattlecardCompany,
    BattlecardLead,
    BattlecardOut,
    BattlecardSignal,
    StrategySchema,
)
from app.services.executive_agent.service import ExecutiveAgent
from app.services.feedback_loop.service import FeedbackLoopService
from app.services.permissions import get_visible_user_ids, user_can_view_assignment
from app.services.resource_predictor import ResourcePredictorService
from app.services.workflow_orchestrator import BeeEvent, WorkflowOrchestrator

router = APIRouter(prefix="/opportunities", tags=["Opportunities"])


def _hidden_from(session: Session, current_user: User | None, opportunity) -> bool:
    """True if ``current_user`` should get a 404 for this single opportunity.

    Combines both boundaries a single-record fetch must check: the tenant
    itself (``organization_id`` — an OWNER/ADMIN's assignment check alone
    never restricts this, since :func:`user_can_view_assignment` returns
    True unconditionally for unassigned records) and the per-rep assignment
    scope within that tenant.
    """
    if current_user is None:
        return False
    if (
        opportunity.organization_id is not None
        and opportunity.organization_id != current_user.organization_id
    ):
        return True
    return not user_can_view_assignment(session, current_user, opportunity.assigned_to_user_id)


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
    current_user: User | None = Depends(get_current_user_optional),
) -> list[dict]:
    """Return opportunities, defaulting to READY_TO_ACTION sorted by score.

    When the request carries a valid session token (a logged-in dashboard
    user, as opposed to the shared X-API-Key used by service integrations),
    results are scoped to what that user is allowed to see: everything in
    their organization for OWNER/ADMIN, their team's subtree for MANAGER, or
    only their own assignments for MEMBER (see ``app.services.permissions``).
    Requests without a session token are unaffected — this keeps existing
    API-key-only integrations working exactly as before.
    """
    repo = OpportunityRepository(session)
    visible_user_ids = get_visible_user_ids(session, current_user) if current_user else None
    organization_id = current_user.organization_id if current_user else None

    if opp_status is None or opp_status == "ready_to_action":
        items = repo.list_ready_to_action(
            limit=limit,
            offset=offset,
            visible_user_ids=visible_user_ids,
            organization_id=organization_id,
        )
    else:
        items = repo.list_scoped(
            limit=limit,
            offset=offset,
            visible_user_ids=visible_user_ids,
            organization_id=organization_id,
        )

    return [
        {
            "id": str(item.id),
            "title": item.title,
            "status": str(item.status.value if hasattr(item.status, "value") else item.status),
            "score": item.score,
            "signal_id": str(item.signal_id) if item.signal_id else None,
            "lead_id": str(item.lead_id) if item.lead_id else None,
            "company_id": str(item.company_id) if item.company_id else None,
            "assigned_to_user_id": str(item.assigned_to_user_id)
            if item.assigned_to_user_id
            else None,
            "hot_lead": (item.strategy or {}).get("hot_lead", False),
            # The frontend's Opportunity type expects this on every item (it's
            # what PipelineBoard/SignalStream read pain_point/channel/hot_lead/
            # timing_window from) — omitting it silently zeroed out the hot-lead
            # flame badge, the "ready" pipeline stage, and enrichment status for
            # every real (non-demo) opportunity.
            "strategy": item.strategy or {},
            "amount": item.amount,
            "expected_close_date": item.expected_close_date.isoformat()
            if item.expected_close_date
            else None,
            "qualification": item.qualification or {},
            "created_at": item.created_at.isoformat(),
            "updated_at": item.updated_at.isoformat(),
            # Win/Loss Analysis — null until the outcome is recorded.
            "loss_reason": item.loss_reason,
            "competitor": item.competitor,
            "closed_at": item.closed_at.isoformat() if item.closed_at else None,
        }
        for item in items
    ]


@router.patch(
    "/{opportunity_id}",
    response_model=OpportunityOut,
    summary="Update forecasting/qualification fields (amount, expected close date, MEDDIC)",
)
def update_opportunity(
    opportunity_id: uuid.UUID,
    body: OpportunityUpdateIn,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> OpportunityOut:
    """Patch the fields a rep fills in by hand — never generated by BEE.

    Deliberately narrow: this is not a general opportunity editor. ``status``
    is never writable here — a non-terminal pipeline move goes through
    ``PATCH /{id}/stage`` (the CRM Kanban drag), and closing a deal goes
    through ``PATCH /{id}/outcome`` (it carries feedback-loop and workflow
    side effects neither of the other two endpoints trigger). Only the three
    forecasting/qualification inputs are writable here, and only the ones the
    caller actually sent (``exclude_unset``) — omitted fields are left alone,
    an explicit ``null`` clears them.
    """
    repo = OpportunityRepository(session)
    opportunity = repo.get(opportunity_id)
    if opportunity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    if _hidden_from(session, current_user, opportunity):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

    updates = body.model_dump(exclude_unset=True)
    if "qualification" in updates:
        if updates["qualification"] is None:
            # ``qualification`` is NOT NULL at the DB layer (missing keys
            # already mean "not yet confirmed" — see the model docstring),
            # so an explicit null clears it back to that same "nothing
            # confirmed" state instead of attempting to write a null into a
            # non-nullable column.
            updates["qualification"] = {}
        else:
            # Merge, don't replace: the frontend can send just the one
            # criterion it toggled. A full-replace here made two rapid
            # toggles (each PATCH racing independently on the network) able
            # to lose one another — whichever request's stale snapshot
            # committed last would silently wipe out the other's change.
            # Merging against the current DB value at write time makes
            # toggling different keys commute regardless of arrival order.
            updates["qualification"] = {
                **(opportunity.qualification or {}),
                **updates["qualification"],
            }
    for field, value in updates.items():
        setattr(opportunity, field, value)

    repo.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    return OpportunityOut.model_validate(opportunity)


@router.patch(
    "/{opportunity_id}/stage",
    response_model=OpportunityOut,
    summary="Move an opportunity between pipeline stages (CRM Kanban drag)",
)
def move_opportunity_stage(
    opportunity_id: uuid.UUID,
    body: OpportunityStageIn,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> OpportunityOut:
    """The single write path behind dragging a card on the CRM Kanban board.

    Restricted to the four non-terminal stages (``OpportunityStageIn``) — a
    closed deal (WON/LOST/DISMISSED) is never moved back into the open
    pipeline this way, and never moved TO closed this way either; that stays
    ``PATCH /{id}/outcome``, which carries the business logic a bare status
    flip must not skip.

    Enforces the one real gate in the state machine: an opportunity can't
    become ``READY_TO_ACTION`` with an incomplete battlecard (see
    ``OpportunityStatus``'s own docstring) — dragging a card into that
    column before ``StrategyGeneratorService`` has produced a full strategy
    is rejected, same rule the engine itself enforces on the way in.
    """
    repo = OpportunityRepository(session)
    opportunity = repo.get(opportunity_id)
    if opportunity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    if _hidden_from(session, current_user, opportunity):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

    if opportunity.status in (
        OpportunityStatus.WON,
        OpportunityStatus.LOST,
        OpportunityStatus.DISMISSED,
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This opportunity is closed — reopening isn't supported from the Kanban board.",
        )

    new_status = OpportunityStatus(body.status)
    if new_status == OpportunityStatus.READY_TO_ACTION:
        strat = opportunity.strategy or {}
        battlecard_complete = bool(
            strat.get("pain_point")
            and strat.get("closing_argument")
            and (strat.get("timing_window") or {}).get("reason")
        )
        if not battlecard_complete:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This opportunity's battlecard isn't complete yet — it can't move to Ready to action.",
            )

    opportunity.status = new_status
    repo.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    return OpportunityOut.model_validate(opportunity)


@router.get(
    "/{opportunity_id}/battlecard",
    response_model=BattlecardOut,
    summary="Get the CEO battlecard for an opportunity",
)
def get_battlecard(
    opportunity_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> BattlecardOut:
    """Return the fully synthesized battlecard for a single opportunity.

    The response bundles company context, lead context, the originating signal,
    and the complete generated strategy (pain_point, closing_argument,
    timing_window) — ready for the dashboard to render without further API calls
    or data transformation.

    ``ready_to_action`` is ``True`` only when the strategy is complete. The
    endpoint returns the battlecard regardless of status so the frontend can
    display in-progress cards with a clear incomplete state.

    When the caller is authenticated, a MANAGER/MEMBER who can't see this
    opportunity (per ``app.services.permissions``) gets a 404, same as if it
    didn't exist — this is a battlecard, not a public listing.
    """
    repo = OpportunityRepository(session)
    result = repo.get_with_relations(opportunity_id)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found.",
        )

    opportunity, signal, company, lead = result

    if _hidden_from(session, current_user, opportunity):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

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
            opportunity.status.value if hasattr(opportunity.status, "value") else opportunity.status
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
    current_user: User | None = Depends(get_current_user_optional),
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

    if current_user is not None:
        target = OpportunityRepository(session).get(opportunity_id)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found."
            )
        if _hidden_from(session, current_user, target):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found."
            )

    # ── Step 1: Resource Gate (opt-in) ────────────────────────────────────────
    prediction = None
    if body.outcome == "won" and settings.RESOURCE_PREDICTION_ENABLED:
        repo = OpportunityRepository(session)
        opp = repo.get(opportunity_id)
        if opp is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found."
            )

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
    # Fires for both won and lost — CRMUpdateHandler and OutboundWebhookHandler
    # both already subscribe to "opportunity.lost" (see
    # app.services.workflow_orchestrator.handlers), but until now nothing ever
    # published it, so a lost deal silently reached no integration at all.
    #
    # Skipped entirely when already_recorded=True: record_outcome() is a
    # documented no-op on a duplicate/retried submission (the DB is left
    # untouched), but publishing here is NOT gated on that by the DB write —
    # without this check, a double-click on "Mark Won", a client retry after
    # a timeout, or a resubmission with a *different* outcome than what's
    # actually stored (e.g. "won" sent for a deal already recorded LOST)
    # would still fire a fresh event and re-trigger CRM/billing/delivery/
    # outbound-webhook side effects (a second invoice, a second delivery
    # ticket, a duplicate "deal won" notification) for something that
    # already happened — or, in the outcome-flip case, for the WRONG
    # outcome entirely. Building the event from outcome_out (what's actually
    # persisted) rather than body (what this particular request asked for)
    # closes that second gap for good, not just for the duplicate-call case.
    workflow_tasks_dispatched = 0
    if not outcome_out.already_recorded:
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
                event_type=f"opportunity.{outcome_out.outcome}",
                entity_id=opportunity_id,
                entity_type="opportunity",
                payload={
                    "opportunity_id": str(opportunity_id),
                    "organization_id": str(opp2.organization_id)
                    if opp2 and opp2.organization_id
                    else None,
                    "company_name": company_name,
                    "score": opp2.score if opp2 else 0,
                    "loss_reason": outcome_out.loss_reason,
                    "competitor": outcome_out.competitor,
                    "notes": body.notes,
                },
            )
            orchestrator = WorkflowOrchestrator(session)
            tasks = orchestrator.publish(event)
            session.commit()
            workflow_tasks_dispatched = len(tasks)
        except Exception:  # noqa: BLE001
            import logging

            # A failed commit leaves the session invalidated — anything reusing
            # it afterwards (the AnomalyDetector check right below) would raise
            # too and silently no-op. Roll back so the rest of the request can
            # still use this session normally.
            session.rollback()
            logging.getLogger(__name__).exception(
                "WorkflowOrchestrator dispatch failed for opp %s", opportunity_id
            )

    # ── Step 4: Trigger AnomalyDetector after every outcome ───────────────────
    # Run automatically (non-blocking) so the CEO is alerted if this outcome
    # creates a statistically significant conversion-rate anomaly.
    _trigger_anomaly_check(session)

    return OutcomeWithPrediction(
        opportunity_id=str(outcome_out.opportunity_id),
        outcome=outcome_out.outcome,
        loss_reason=outcome_out.loss_reason,
        competitor=outcome_out.competitor,
        closed_at=outcome_out.closed_at.isoformat(),
        message=outcome_out.message,
        already_recorded=outcome_out.already_recorded,
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
        # check_all() only flushes, never commits (same contract as every
        # other service in this codebase) — the manual POST
        # /analytics/anomalies/check endpoint commits right after calling it
        # for the same reason. Without this, any alert it just created here
        # was never persisted: it lived only in this request's flushed-but-
        # uncommitted session and vanished when the request ended.
        session.commit()
        if len(result.new_alerts) > 0:
            import logging

            logging.getLogger(__name__).info(
                "AnomalyDetector: %d new alert(s) created after outcome recording",
                len(result.new_alerts),
            )
    except Exception:  # noqa: BLE001
        import logging

        # Same reasoning as the WorkflowOrchestrator dispatch above: a DB
        # error mid-check leaves the shared session unusable for whatever
        # runs after this in the request unless it's rolled back here.
        session.rollback()
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
    current_user: User | None = Depends(get_current_user_optional),
) -> ArtifactBundle:
    """Return the execution artifact bundle for an opportunity.

    On first call, the ExecutiveAgent generates: email draft, meeting agenda,
    and next steps. The result is cached in ``opportunity.execution_artifacts``
    and returned instantly on subsequent calls (unless ``force=true``).

    When artifacts are generated, BEE fires a webhook to ``WEBHOOK_EXECUTION_URL``
    (if configured) so n8n / Zapier can execute the email send, CRM update, etc.
    """
    if current_user is not None:
        target = OpportunityRepository(session).get(opportunity_id)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found."
            )
        if _hidden_from(session, current_user, target):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found."
            )

    agent = ExecutiveAgent(session)
    try:
        return agent.get_or_generate(opportunity_id, force=force)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
