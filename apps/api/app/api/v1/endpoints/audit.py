"""AuditTrailService API endpoints — agent decision log and observability."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_organization_id, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.user import User
from app.schemas.admin_audit import AdminAuditLogOut
from app.schemas.audit_trail import AuditDecisionChain, AuditEntryOut, AuditSummary
from app.services.admin_audit import AdminAuditService
from app.services.audit_trail import AuditTrailService

router = APIRouter(prefix="/audit", tags=["Audit Trail (Observability)"])


def _get_audit(session: Session = Depends(get_session)) -> AuditTrailService:
    return AuditTrailService(session)


@router.get(
    "/decisions",
    response_model=list[AuditEntryOut],
    summary="Browse agent decision log",
)
def list_decisions(
    agent_type: str | None = Query(default=None, description="Filter by agent (strategy_generator, executive_agent, …)"),
    decision_type: str | None = Query(default=None, description="Filter by decision type"),
    opportunity_id: uuid.UUID | None = Query(default=None),
    lead_id: uuid.UUID | None = Query(default=None),
    manual_review_required: bool | None = Query(default=None, description="True = show only low-confidence decisions"),
    session_id: str | None = Query(default=None),
    limit: int = Query(default=50, le=500),
    audit: AuditTrailService = Depends(_get_audit),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[AuditEntryOut]:
    """Browse the audit trail of all agent decisions.

    Filters:
    * ``agent_type``: strategy_generator | executive_agent | psychographic_analyzer |
      dark_funnel | smart_engagement | agent_orchestrator | workflow_orchestrator
    * ``manual_review_required=true``: surface all low-confidence decisions (score < 0.8)
      that need CEO attention before execution
    * ``opportunity_id``: all decisions related to a specific opportunity
    * ``session_id``: decisions in one processing chain

    Each entry includes:
    * ``context_snapshot``: what information the agent had at decision time
    * ``market_data_used``: which market intelligence records were consulted
    * ``strategy_reasoning``: why the agent made this specific decision
    * ``output_snapshot``: what was generated
    * ``confidence_score``: 0-1, < 0.8 → flagged for manual review
    """
    entries = audit.list_entries(
        agent_type=agent_type,
        decision_type=decision_type,
        opportunity_id=opportunity_id,
        lead_id=lead_id,
        manual_review_required=manual_review_required,
        session_id=session_id,
        limit=limit,
        organization_id=organization_id,
    )
    return [AuditEntryOut.model_validate(e) for e in entries]


@router.get(
    "/decisions/{entry_id}",
    response_model=AuditEntryOut,
    summary="Get a specific audit entry with full snapshot",
)
def get_decision(
    entry_id: uuid.UUID,
    audit: AuditTrailService = Depends(_get_audit),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> AuditEntryOut:
    entry = audit.get_entry(entry_id, organization_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit entry not found")
    return AuditEntryOut.model_validate(entry)


@router.get(
    "/opportunities/{opportunity_id}/chain",
    response_model=AuditDecisionChain,
    summary="Get full decision chain for an opportunity",
)
def get_opportunity_chain(
    opportunity_id: uuid.UUID,
    audit: AuditTrailService = Depends(_get_audit),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> AuditDecisionChain:
    """Return all agent decisions for an opportunity in chronological order.

    This is the complete lineage from signal classification → strategy generation
    → DISC adaptation → artifact creation → orchestrator action. The CEO can
    trace exactly why BEE recommended a specific approach for this deal.
    """
    entries = audit.get_decisions_for_opportunity(opportunity_id, organization_id)
    has_low_confidence = any(e.confidence_score < 0.8 for e in entries)
    requires_review = any(e.manual_review_required for e in entries)

    return AuditDecisionChain(
        opportunity_id=opportunity_id,
        entries=[AuditEntryOut.model_validate(e) for e in entries],
        total_entries=len(entries),
        has_low_confidence=has_low_confidence,
        requires_review=requires_review,
    )


@router.get(
    "/summary",
    response_model=AuditSummary,
    summary="Audit trail overview statistics",
)
def get_audit_summary(
    audit: AuditTrailService = Depends(_get_audit),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> AuditSummary:
    """Return aggregate statistics about the audit trail."""
    return audit.get_summary(organization_id)


@router.get(
    "/admin",
    response_model=list[AdminAuditLogOut],
    summary="Browse the general admin audit log (OWNER/ADMIN only)",
)
def list_admin_audit_log(
    action: str | None = Query(default=None, description="Filter by action, e.g. 'user.role_changed'"),
    entity_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> list[AdminAuditLogOut]:
    """"Who changed what" for security-relevant admin actions — role
    changes, user deletion, API key create/revoke, integration connect/
    disconnect, org settings changes. See app.models.admin_audit_log for
    why this is separate from /audit/decisions above (that's an AI
    agent's own decision log, this is a human admin's).

    OWNER/ADMIN only, unlike the decision-log endpoints above — this can
    reveal which teammate did what, which every role shouldn't see.
    """
    entries = AdminAuditService(session).list_entries(
        organization_id=current_user.organization_id,
        action=action,
        entity_id=entity_id,
        limit=limit,
        offset=offset,
    )
    return [AdminAuditLogOut.model_validate(e) for e in entries]
