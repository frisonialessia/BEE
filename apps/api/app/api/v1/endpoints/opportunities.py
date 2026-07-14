"""Opportunity endpoints.

Exposes the battlecard — BEE's flagship output: a fully synthesized, CEO-ready
sales brief assembled from lead + signal + generated strategy, returned in a
single HTTP call with no post-processing required by the frontend.

The battlecard is the answer to the question every salesperson has:
"I have 30 seconds — what do I say, to whom, and why right now?"
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.models.base import OpportunityStatus
from app.repositories.opportunity import OpportunityRepository
from app.schemas.strategy import (
    BattlecardCompany,
    BattlecardLead,
    BattlecardOut,
    BattlecardSignal,
    StrategySchema,
)

router = APIRouter(prefix="/opportunities", tags=["Opportunities"])


@router.get(
    "",
    response_model=list[dict],
    summary="List opportunities ready to action",
)
def list_opportunities(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
) -> list[dict]:
    """Return opportunities, defaulting to READY_TO_ACTION sorted by score."""
    repo = OpportunityRepository(session)
    if status is None or status == "ready_to_action":
        items = repo.list_ready_to_action(limit=limit, offset=offset)
    else:
        items = repo.list(limit=limit, offset=offset)

    return [
        {
            "id": str(item.id),
            "title": item.title,
            "status": item.status,
            "score": item.score,
            "signal_id": str(item.signal_id) if item.signal_id else None,
            "lead_id": str(item.lead_id) if item.lead_id else None,
            "company_id": str(item.company_id) if item.company_id else None,
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

    # Parse the strategy JSON into the typed schema for validation.
    # If the strategy is incomplete (e.g. still DETECTED), we build a stub so
    # the battlecard endpoint always returns a usable structure.
    strategy_dict = opportunity.strategy or {}
    try:
        strategy = StrategySchema.model_validate(strategy_dict)
    except Exception:
        # Incomplete strategy — build a minimal stub so the endpoint doesn't 500.
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
        status=str(opportunity.status.value if hasattr(opportunity.status, "value") else opportunity.status),
        score=opportunity.score,
        ready_to_action=opportunity.status == OpportunityStatus.READY_TO_ACTION,
        company=company_out,
        lead=lead_out,
        signal=signal_out,
        strategy=strategy,
        created_at=opportunity.created_at,
        updated_at=opportunity.updated_at,
    )
