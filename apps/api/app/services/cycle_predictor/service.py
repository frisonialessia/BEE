"""CyclePredictorService — predicted time-to-close for an open Opportunity.

Answers a different question than everything else that touches "days to
close" in this codebase (see the module docstrings of feedback_loop and
scenario_simulator): not "how did deals like this perform on average", but
"given THIS specific open opportunity, when is it likely to be decided?"

How it predicts
----------------
Finds a cohort of this organization's own already-CLOSED opportunities
(won or lost — resolution time, not win probability, is what's being
predicted) that are comparable to the target one, and uses the **median**
of their (closed_at − created_at) as the predicted cycle length. Comparable
means, in order of preference (each tier tried only if the previous one
doesn't yield enough deals to trust):

1. Same signal_type AND same company industry
2. Same signal_type
3. Same company industry
4. Every closed deal this organization has

A median over a real cohort, never a regression model or an invented
formula — consistent with this codebase's "read real
FeedbackLoopService/StrategyOutcome history, never fabricate" pattern
(see scenario_simulator's own docstring for the same principle applied to
revenue projections).

Honesty guardrails
-------------------
* Fewer than ``_MIN_COHORT`` (3) comparable closed deals at every tier →
  no prediction. ``CyclePrediction.available=False`` with a clear
  ``reason``, never a number backed by 1-2 data points dressed up as a
  forecast.
* An already-closed opportunity (WON/LOST/DISMISSED) has nothing left to
  predict — same "not available" response, different reason.
* ``confidence`` is a direct function of cohort size (low/medium/high),
  shown alongside the number so a rep can judge how much to trust a
  3-deal median vs. a 20-deal one — never hidden behind a single
  overconfident-looking figure.
"""

from __future__ import annotations

import statistics
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session, select

from app.models.base import OpportunityStatus
from app.models.company import Company
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.services.permissions import scope_by_organization_id

_MIN_COHORT = 3
_CLOSED_STATUSES = (OpportunityStatus.WON, OpportunityStatus.LOST)


@dataclass
class _ClosedDeal:
    cycle_days: float
    signal_type: str | None
    industry: str | None


@dataclass
class CyclePrediction:
    available: bool
    predicted_cycle_days: float | None = None
    predicted_close_date: date | None = None
    days_elapsed: int | None = None
    days_remaining: int | None = None
    is_overdue: bool = False
    cohort_size: int = 0
    cohort_basis: str | None = None
    confidence: str | None = None  # "low" | "medium" | "high"
    reason: str | None = None  # set only when available=False


class CyclePredictorService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def predict(
        self,
        opportunity: Opportunity,
        signal: Signal | None,
        company: Company | None,
        organization_id: uuid.UUID | None,
    ) -> CyclePrediction:
        if opportunity.status in _CLOSED_STATUSES or opportunity.status == OpportunityStatus.DISMISSED:
            return CyclePrediction(available=False, reason="Esta oportunidad ya está cerrada — no hay nada que predecir.")

        deals = self._closed_deals(organization_id)
        if len(deals) < _MIN_COHORT:
            return CyclePrediction(
                available=False,
                reason="Todavía no hay suficientes deals cerrados en esta cuenta para predecir un ciclo.",
            )

        target_signal_type = signal.signal_type.value if signal else None
        target_industry = company.industry if company else None

        cohort, basis = self._best_cohort(deals, target_signal_type, target_industry)
        if cohort is None:
            return CyclePrediction(
                available=False,
                reason="No encontramos deals cerrados lo bastante parecidos todavía.",
            )

        predicted_cycle = statistics.median(d.cycle_days for d in cohort)
        created_at = opportunity.created_at
        if created_at.tzinfo is None:  # SQLite round-trips as naive; always written UTC
            created_at = created_at.replace(tzinfo=UTC)
        now = datetime.now(UTC)
        days_elapsed = (now - created_at).days
        days_remaining = round(predicted_cycle) - days_elapsed
        predicted_close_date = (created_at + timedelta(days=predicted_cycle)).date()

        confidence = "high" if len(cohort) >= 10 else "medium" if len(cohort) >= 5 else "low"

        return CyclePrediction(
            available=True,
            predicted_cycle_days=round(predicted_cycle, 1),
            predicted_close_date=predicted_close_date,
            days_elapsed=days_elapsed,
            days_remaining=days_remaining,
            is_overdue=days_remaining < 0,
            cohort_size=len(cohort),
            cohort_basis=basis,
            confidence=confidence,
        )

    # ── Cohort building ──────────────────────────────────────────────────────

    def _closed_deals(self, organization_id: uuid.UUID | None) -> list[_ClosedDeal]:
        stmt = select(Opportunity).where(
            Opportunity.status.in_(_CLOSED_STATUSES),  # type: ignore[attr-defined]
            Opportunity.closed_at.is_not(None),  # type: ignore[union-attr]
        )
        stmt = scope_by_organization_id(stmt, Opportunity.organization_id, organization_id)
        opportunities = self.session.exec(stmt).all()
        if not opportunities:
            return []

        signal_ids = {o.signal_id for o in opportunities if o.signal_id}
        company_ids = {o.company_id for o in opportunities if o.company_id}
        signal_types: dict[uuid.UUID, str] = {}
        if signal_ids:
            for s in self.session.exec(select(Signal).where(Signal.id.in_(signal_ids))).all():  # type: ignore[attr-defined]
                signal_types[s.id] = s.signal_type.value
        industries: dict[uuid.UUID, str | None] = {}
        if company_ids:
            for c in self.session.exec(select(Company).where(Company.id.in_(company_ids))).all():  # type: ignore[attr-defined]
                industries[c.id] = c.industry

        deals: list[_ClosedDeal] = []
        for o in opportunities:
            if not o.closed_at:
                continue
            closed_at = o.closed_at if o.closed_at.tzinfo else o.closed_at.replace(tzinfo=UTC)
            created_at = o.created_at if o.created_at.tzinfo else o.created_at.replace(tzinfo=UTC)
            cycle_days = (closed_at - created_at).total_seconds() / 86_400
            if cycle_days < 0:
                continue  # data integrity guard — never let a bad row skew the median
            deals.append(
                _ClosedDeal(
                    cycle_days=cycle_days,
                    signal_type=signal_types.get(o.signal_id) if o.signal_id else None,
                    industry=industries.get(o.company_id) if o.company_id else None,
                )
            )
        return deals

    @staticmethod
    def _best_cohort(
        deals: list[_ClosedDeal], signal_type: str | None, industry: str | None
    ) -> tuple[list[_ClosedDeal], str] | tuple[None, None]:
        tiers: list[tuple[list[_ClosedDeal], str]] = []
        if signal_type and industry:
            tiers.append((
                [d for d in deals if d.signal_type == signal_type and d.industry == industry],
                "deals cerrados similares por tipo de señal e industria",
            ))
        if signal_type:
            tiers.append((
                [d for d in deals if d.signal_type == signal_type],
                "deals cerrados similares por tipo de señal",
            ))
        if industry:
            tiers.append((
                [d for d in deals if d.industry == industry],
                "deals cerrados similares por industria",
            ))
        tiers.append((deals, "todos los deals cerrados de la cuenta"))

        for cohort, basis in tiers:
            if len(cohort) >= _MIN_COHORT:
                return cohort, basis
        return None, None
