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

Signal recalibration
---------------------
A second, independent insight on top of the base prediction: BEE's signal
engine keeps watching a company for as long as its opportunity stays open —
nothing else in this codebase (or, as far as this org's data shows, in
market-intelligence software generally) reuses that ongoing feed to ask
"did something happen in the market *after* this deal opened, and did that
historically correlate with a faster or slower close?" That is what
``_signal_recalibration`` answers: it splits the same comparable cohort
into deals that had a NEW signal on their company between open and close
(excluding the signal that originally created the opportunity) and deals
that didn't, and compares their median cycles.

Same honesty rule as the base prediction, applied per side: fewer than
``_MIN_SIGNAL_COHORT`` (3) deals on *either* side of the split → no
comparison, not a guess. This will very often be unavailable on a small or
young account — that's the correct, honest outcome, not a bug: BEE's own
production data has zero closed deals as of this writing, so there is
nothing yet to discover this pattern from anywhere but a synthetic demo
(see lib/demo/seed-history.ts on the frontend for that illustration, and
its docstring for why it's labeled as illustrative rather than a proven
trend).
"""

from __future__ import annotations

import statistics
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session, select

from app.models.base import OpportunityStatus
from app.models.company import Company
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.services.permissions import scope_by_organization_id

_MIN_COHORT = 3
_MIN_SIGNAL_COHORT = 3
_CLOSED_STATUSES = (OpportunityStatus.WON, OpportunityStatus.LOST)


def _aware(dt: datetime) -> datetime:
    """SQLite round-trips naive datetimes even though everything here is
    always written in UTC — normalize once at the boundary instead of
    scattering this check through every comparison."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


@dataclass
class _ClosedDeal:
    cycle_days: float
    signal_type: str | None
    industry: str | None
    company_id: uuid.UUID | None
    origin_signal_id: uuid.UUID | None
    created_at: datetime
    closed_at: datetime


@dataclass
class SignalRecalibration:
    """Whether a NEW signal on the same company, detected while a deal was
    open, historically correlates with a faster or slower close — see this
    module's docstring. Independent of, and additive to, the base
    prediction: never blended into ``predicted_cycle_days`` itself."""

    available: bool
    reason: str | None = None
    with_signal_median_days: float | None = None
    with_signal_count: int = 0
    without_signal_median_days: float | None = None
    without_signal_count: int = 0
    delta_days: float | None = None  # with − without; negative = faster
    target_has_new_signal: bool = False
    target_new_signal_types: list[str] = field(default_factory=list)


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
    signal_recalibration: SignalRecalibration | None = None


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
            signal_recalibration=self._signal_recalibration(cohort, opportunity, organization_id),
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
            closed_at = _aware(o.closed_at)
            created_at = _aware(o.created_at)
            cycle_days = (closed_at - created_at).total_seconds() / 86_400
            if cycle_days < 0:
                continue  # data integrity guard — never let a bad row skew the median
            deals.append(
                _ClosedDeal(
                    cycle_days=cycle_days,
                    signal_type=signal_types.get(o.signal_id) if o.signal_id else None,
                    industry=industries.get(o.company_id) if o.company_id else None,
                    company_id=o.company_id,
                    origin_signal_id=o.signal_id,
                    created_at=created_at,
                    closed_at=closed_at,
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

    # ── Signal recalibration ─────────────────────────────────────────────────

    def _signal_recalibration(
        self, cohort: list[_ClosedDeal], target: Opportunity, organization_id: uuid.UUID | None
    ) -> SignalRecalibration | None:
        """See this module's docstring. Only called for the same cohort
        already used for the base prediction, so "comparable" means the
        same thing in both places."""
        company_ids = {d.company_id for d in cohort if d.company_id}
        if target.company_id:
            company_ids.add(target.company_id)
        signals_by_company: dict[uuid.UUID, list[Signal]] = defaultdict(list)
        if company_ids:
            stmt = select(Signal).where(Signal.company_id.in_(company_ids))  # type: ignore[union-attr]
            stmt = scope_by_organization_id(stmt, Signal.organization_id, organization_id)
            for s in self.session.exec(stmt).all():
                if s.company_id:
                    signals_by_company[s.company_id].append(s)

        with_group: list[float] = []
        without_group: list[float] = []
        for deal in cohort:
            if not deal.company_id:
                continue  # can't check for an intermediate signal without a company to check
            has_new_signal = any(
                s.id != deal.origin_signal_id and deal.created_at < _aware(s.detected_at) <= deal.closed_at
                for s in signals_by_company.get(deal.company_id, [])
            )
            (with_group if has_new_signal else without_group).append(deal.cycle_days)

        target_has_new_signal = False
        target_new_signal_types: list[str] = []
        if target.company_id and target.company_id in signals_by_company:
            created_at = _aware(target.created_at)
            now = datetime.now(UTC)
            new_signals = [
                s
                for s in signals_by_company[target.company_id]
                if s.id != target.signal_id and created_at < _aware(s.detected_at) <= now
            ]
            target_has_new_signal = bool(new_signals)
            target_new_signal_types = sorted({s.signal_type.value for s in new_signals})

        if len(with_group) < _MIN_SIGNAL_COHORT or len(without_group) < _MIN_SIGNAL_COHORT:
            return SignalRecalibration(
                available=False,
                reason=(
                    "Todavía no hay suficientes deals cerrados con y sin una señal nueva "
                    "de mercado durante el ciclo para comparar."
                ),
                target_has_new_signal=target_has_new_signal,
                target_new_signal_types=target_new_signal_types,
            )

        with_median = statistics.median(with_group)
        without_median = statistics.median(without_group)
        return SignalRecalibration(
            available=True,
            with_signal_median_days=round(with_median, 1),
            with_signal_count=len(with_group),
            without_signal_median_days=round(without_median, 1),
            without_signal_count=len(without_group),
            delta_days=round(with_median - without_median, 1),
            target_has_new_signal=target_has_new_signal,
            target_new_signal_types=target_new_signal_types,
        )
