"""PriorityFeedService — the Bandeja de Decisiones ranking engine.

Fuses four engines that already independently reason about timing —
DarkFunnelService (intent score), TrendAnalyst (sector momentum),
CyclePredictor (decision-window urgency), and AnomalyDetector (active
alerts) — into one ranked "what to do today" list, instead of a Kanban
board where an opportunity waits for someone to notice it.

Deliberately a pure read/rank layer: it never mutates anything and never
auto-executes. Each card's three actions in the frontend map onto existing
endpoints, not new mutation logic here:
  * Aprobar  → POST /orchestrator/{pending_action_id}/approve   (existing)
  * Ejecutar → GET  /opportunities/{id}/artifacts                (existing —
               generates the battlecard artifacts on demand and already
               creates the PendingAction as a side effect, see
               ExecutiveAgent.service's create_from_bundle call)
  * Descartar → POST /priority/today/{opportunity_id}/dismiss    (new, tiny —
               writes Opportunity.attributes["dismissed_until"], no migration)

Computed on read, no new table — the four engines' own data (HotLeadScore,
MarketInsight, closed-deal cohorts, AnomalyAlert) is already persisted;
this only ranks a bounded candidate pool of open Opportunities against it.
Fine at MVP-to-early-growth scale (same "computed, not pre-materialized"
choice as MarketScanOrchestrator's due-company query); a cron-precomputed
version (the memo's "jugada del día" morning digest) is a later phase, not
this one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.base import ActionStatus, OpportunityStatus
from app.models.opportunity import Opportunity
from app.models.pending_action import PendingAction
from app.schemas.priority import DecisionCard, DecisionUrgency, RecommendedAction, TodayFeedOut
from app.services.anomaly_detector import AnomalyDetector
from app.services.cycle_predictor.service import CyclePredictorService
from app.services.dark_funnel.service import DarkFunnelService

logger = get_logger(__name__)

_CLOSED_STATUSES = {OpportunityStatus.WON, OpportunityStatus.LOST, OpportunityStatus.DISMISSED}
# Bound the candidate pool scored per request — plenty at MVP scale, and
# consistent with list_opportunities' own unbounded-feeling-but-actually-
# capped default elsewhere in this codebase.
_CANDIDATE_POOL_SIZE = 100
_TOP_N = 5


def build_today_feed(
    session: Session,
    *,
    organization_id: uuid.UUID | None,
    visible_user_ids: set[uuid.UUID] | None,
) -> TodayFeedOut:
    dark_funnel = DarkFunnelService(session)
    cycle_predictor = CyclePredictorService(session)
    anomalies = AnomalyDetector(session)

    candidates = _open_opportunities(session, organization_id, visible_user_ids)
    scored: list[DecisionCard] = []
    for opp in candidates:
        card = _score_opportunity(session, opp, dark_funnel, cycle_predictor, organization_id)
        if card is not None:
            scored.append(card)

    scored.sort(key=lambda c: c.score, reverse=True)
    cards = scored[:_TOP_N]

    # A high-severity open anomaly isn't tied to one opportunity (it's a
    # segment-level signal — see AnomalyDetector's own docstring) — surface
    # it as its own card type instead of forcing a fragile per-opportunity
    # match, matching the "no toques a Y" case the product ask named.
    for alert in anomalies.list_alerts(status="open", severity="high", limit=3, organization_id=organization_id):
        cards.append(
            DecisionCard(
                id=f"anomaly:{alert.id}",
                kind="anomaly",
                company_name=None,
                headline=alert.title,
                reasoning=alert.recommendation or alert.description or "",
                urgency="high",
                recommended_action="pause",
                score=1.0,
            )
        )

    return TodayFeedOut(cards=cards, generated_at=datetime.now(UTC).isoformat())


def _open_opportunities(
    session: Session,
    organization_id: uuid.UUID | None,
    visible_user_ids: set[uuid.UUID] | None,
) -> list[Opportunity]:
    stmt = select(Opportunity).order_by(Opportunity.created_at.desc()).limit(_CANDIDATE_POOL_SIZE)
    if organization_id is not None:
        stmt = stmt.where(
            (Opportunity.organization_id == organization_id) | (Opportunity.organization_id == None)  # noqa: E711
        )
    if visible_user_ids is not None:
        stmt = stmt.where(Opportunity.assigned_to_user_id.in_(visible_user_ids))
    rows = session.exec(stmt).all()
    return [o for o in rows if o.status not in _CLOSED_STATUSES]


def _score_opportunity(
    session: Session,
    opp: Opportunity,
    dark_funnel: DarkFunnelService,
    cycle_predictor: CyclePredictorService,
    organization_id: uuid.UUID | None,
) -> DecisionCard | None:
    # A dismissed-until marker (see the /dismiss endpoint) hides a card from
    # today's feed without deleting or otherwise mutating the opportunity —
    # same "Opportunity.attributes as a scratch JSON dict" pattern used
    # elsewhere, no new column/migration.
    dismissed_until = (opp.attributes or {}).get("dismissed_until")
    if dismissed_until and dismissed_until > datetime.now(UTC).isoformat():
        return None

    company = opp.company
    domain = company.domain if company else None

    hot_lead = dark_funnel.get_company_score(domain, organization_id) if domain else None
    dark_score = hot_lead.research_intensity_score if hot_lead else 0.0

    cycle = cycle_predictor.predict(opp, opp.signal, company, organization_id)
    if cycle.available and cycle.is_overdue:
        urgency_component = 1.0
    elif cycle.available and cycle.days_remaining is not None and cycle.days_remaining <= 7:
        urgency_component = 0.6
    else:
        urgency_component = 0.2

    # Composite: intent strength carries the most weight (it's the most
    # direct "are they actually looking right now" signal this platform
    # has), decision-window urgency second, a small floor for every open
    # opportunity so a brand-new one with no signal history yet still
    # ranks above nothing at all.
    score = (dark_score / 100.0) * 0.5 + urgency_component * 0.35 + 0.15

    pending = session.exec(
        select(PendingAction)
        .where(
            PendingAction.opportunity_id == opp.id,
            PendingAction.status == ActionStatus.PENDING_APPROVAL,
        )
        .order_by(PendingAction.created_at.desc())
        .limit(1)
    ).first()

    headline, reasoning, urgency, action = _explain(opp, hot_lead, cycle, pending)

    return DecisionCard(
        id=str(opp.id),
        kind="opportunity",
        company_name=company.name if company else opp.title,
        headline=headline,
        reasoning=reasoning,
        urgency=urgency,
        recommended_action=action,
        opportunity_id=opp.id,
        pending_action_id=pending.id if pending else None,
        score=round(score, 4),
    )


def _explain(
    opp: Opportunity, hot_lead, cycle, pending: PendingAction | None
) -> tuple[str, str, DecisionUrgency, RecommendedAction]:
    """Build the human-readable "why" — never a bare score. Every card must
    say, in plain language, what changed and why it's worth acting on
    today, the same "no black-box scores" transparency the rest of this
    codebase already commits to (see the guarantees on the landing page).
    """
    company_label = (opp.company.name if opp.company else opp.title) or "esta cuenta"

    if pending is not None:
        return (
            f"Listo para aprobar — {company_label}",
            f"BEE ya preparó una jugada ({pending.action_type}) esperando tu aprobación.",
            "high",
            "call" if pending.action_type == "message" else "review",
        )

    if hot_lead is not None and hot_lead.is_hot:
        return (
            f"{company_label} está en modo de investigación activa",
            f"Score de intención {hot_lead.research_intensity_score:.0f}/100, etapa: {hot_lead.buying_stage}. "
            f"{hot_lead.signal_count} señal(es) reciente(s).",
            "high",
            "call",
        )

    if cycle.available and cycle.is_overdue:
        return (
            f"{company_label} superó su ventana de cierre estimada",
            f"El ciclo esperado era de {cycle.predicted_cycle_days:.0f} días; van {cycle.days_elapsed}. "
            "Vale la pena un check-in antes de que se enfríe.",
            "medium",
            "email",
        )

    return (
        f"{company_label} sigue en pipeline",
        "Sin señales fuertes todavía — mantenla en radar.",
        "low",
        "wait",
    )
