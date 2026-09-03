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
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.base import ActionStatus, OpportunityStatus
from app.models.opportunity import Opportunity
from app.models.pending_action import PendingAction
from app.schemas.priority import (
    DecisionCard,
    DecisionReasonCode,
    DecisionUrgency,
    RecommendedAction,
    TodayFeedOut,
)
from app.services.anomaly_detector import AnomalyDetector
from app.services.cycle_predictor.service import CyclePredictorService
from app.services.dark_funnel.service import DarkFunnelService
from app.services.team_profile import TeamProfileService

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
    team_id: uuid.UUID | None = None,
) -> TodayFeedOut:
    dark_funnel = DarkFunnelService(session)
    cycle_predictor = CyclePredictorService(session)
    anomalies = AnomalyDetector(session)
    team_profiles = TeamProfileService(session)

    candidates = _open_opportunities(session, organization_id, visible_user_ids)
    scored: list[DecisionCard] = []
    for opp in candidates:
        card = _score_opportunity(session, opp, dark_funnel, cycle_predictor, organization_id, team_profiles, team_id)
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
                reason_code="anomaly",
                reason_params={"title": alert.title},
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
    team_profiles: TeamProfileService,
    team_id: uuid.UUID | None,
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

    # Team bias: a team's own signal_weights re-order what already ranks in
    # its visible pool — e.g. a franchise-sales team weighting
    # franchise_expansion 2x sees those opportunities surface first, without
    # this affecting any other team's feed. Neutral (1.0) when the team has
    # no profile, matching pre-TeamProfile behavior exactly.
    if opp.signal is not None:
        score *= team_profiles.get_signal_weight(team_id, opp.signal.signal_type.value)

    pending = session.exec(
        select(PendingAction)
        .where(
            PendingAction.opportunity_id == opp.id,
            PendingAction.status == ActionStatus.PENDING_APPROVAL,
        )
        .order_by(PendingAction.created_at.desc())
        .limit(1)
    ).first()

    explanation = _explain(opp, hot_lead, cycle, pending)

    return DecisionCard(
        id=str(opp.id),
        kind="opportunity",
        company_name=company.name if company else opp.title,
        headline=explanation.headline,
        reasoning=explanation.reasoning,
        urgency=explanation.urgency,
        recommended_action=explanation.action,
        reason_code=explanation.reason_code,
        reason_params=explanation.reason_params,
        opportunity_id=opp.id,
        pending_action_id=pending.id if pending else None,
        score=round(score, 4),
    )


@dataclass(frozen=True, slots=True)
class Explanation:
    """One card's "why" in two forms: a rendered Spanish sentence pair for
    consumers with no translation layer, and a structured ``reason_code`` +
    ``reason_params`` the dashboard renders in the viewer's own locale."""

    headline: str
    reasoning: str
    urgency: DecisionUrgency
    action: RecommendedAction
    reason_code: DecisionReasonCode
    reason_params: dict[str, Any] = field(default_factory=dict)


def _explain(opp: Opportunity, hot_lead, cycle, pending: PendingAction | None) -> Explanation:
    """Build the human-readable "why" — never a bare score. Every card must
    say, in plain language, what changed and why it's worth acting on
    today, the same "no black-box scores" transparency the rest of this
    codebase already commits to (see the guarantees on the landing page).

    The rendered strings are Spanish; the reason_code/reason_params pair is
    what lets the frontend say the same thing in English without a second
    server-side copy of every sentence.
    """
    company_label = (opp.company.name if opp.company else opp.title) or "esta cuenta"

    if pending is not None:
        return Explanation(
            headline=f"Listo para aprobar — {company_label}",
            reasoning=f"BEE ya preparó una jugada ({pending.action_type}) esperando tu aprobación.",
            urgency="high",
            action="call" if pending.action_type == "message" else "review",
            reason_code="pending_approval",
            reason_params={"company": company_label, "action_type": pending.action_type},
        )

    if hot_lead is not None and hot_lead.is_hot:
        return Explanation(
            headline=f"{company_label} está en modo de investigación activa",
            reasoning=(
                f"Score de intención {hot_lead.research_intensity_score:.0f}/100, etapa: {hot_lead.buying_stage}. "
                f"{hot_lead.signal_count} señal(es) reciente(s)."
            ),
            urgency="high",
            action="call",
            reason_code="hot_lead",
            reason_params={
                "company": company_label,
                "score": round(hot_lead.research_intensity_score),
                "stage": hot_lead.buying_stage,
                "signals": hot_lead.signal_count,
            },
        )

    if cycle.available and cycle.is_overdue:
        return Explanation(
            headline=f"{company_label} superó su ventana de cierre estimada",
            reasoning=(
                f"El ciclo esperado era de {cycle.predicted_cycle_days:.0f} días; van {cycle.days_elapsed}. "
                "Vale la pena un check-in antes de que se enfríe."
            ),
            urgency="medium",
            action="email",
            reason_code="cycle_overdue",
            reason_params={
                "company": company_label,
                "predicted_days": round(cycle.predicted_cycle_days or 0),
                "days_elapsed": cycle.days_elapsed,
            },
        )

    return Explanation(
        headline=f"{company_label} sigue en pipeline",
        reasoning="Sin señales fuertes todavía — mantenla en radar.",
        urgency="low",
        action="wait",
        reason_code="in_pipeline",
        reason_params={"company": company_label},
    )
