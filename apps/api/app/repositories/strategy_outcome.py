"""StrategyOutcome repository."""

from __future__ import annotations

import uuid

from sqlmodel import func, select

from app.models.strategy_outcome import StrategyOutcome
from app.repositories.base import BaseRepository
from app.services.permissions import scope_by_organization_id


class StrategyOutcomeRepository(BaseRepository[StrategyOutcome]):
    """Data-access and analytics operations for :class:`StrategyOutcome`."""

    model = StrategyOutcome

    def get_by_opportunity(self, opportunity_id: uuid.UUID) -> StrategyOutcome | None:
        """Return the outcome record for a given opportunity, if it exists."""
        stmt = select(StrategyOutcome).where(
            StrategyOutcome.opportunity_id == opportunity_id
        )
        return self.session.exec(stmt).first()

    def get_win_rates(
        self,
        signal_type: str | None = None,
        industry: str | None = None,
        min_samples: int = 3,
        organization_id: uuid.UUID | None = None,
    ) -> list[dict]:
        """Aggregate win rates by (signal_type, playbook, channel, generator).

        Returns a list of dicts with keys:
        ``signal_type``, ``playbook``, ``channel``, ``generator``, ``total``,
        ``wins``, ``win_rate``, ``avg_days``.

        ``signal_type=None`` aggregates across every signal type (used by the
        org-wide "what's working" view); pass it to scope to one type, same as
        before. Optionally filters by ``industry``. Only returns groups with
        at least ``min_samples`` records so we don't surface noise from
        single-data-point patterns — the same honesty guardrail regardless of
        whether the caller scoped to one signal type or asked for all of them.
        """
        stmt = (
            select(
                StrategyOutcome.signal_type,
                StrategyOutcome.playbook,
                StrategyOutcome.channel,
                StrategyOutcome.generator,
                func.count(StrategyOutcome.id).label("total"),
                func.sum(
                    func.cast(
                        StrategyOutcome.outcome == "won",
                        type_=func.count(StrategyOutcome.id).type,
                    )
                ).label("wins"),
                func.avg(StrategyOutcome.days_to_close).label("avg_days"),
            )
            .group_by(
                StrategyOutcome.signal_type,
                StrategyOutcome.playbook,
                StrategyOutcome.channel,
                StrategyOutcome.generator,
            )
            .having(func.count(StrategyOutcome.id) >= min_samples)
            .order_by(func.count(StrategyOutcome.id).desc())
        )
        if signal_type:
            stmt = stmt.where(StrategyOutcome.signal_type == signal_type)
        if industry:
            stmt = stmt.where(StrategyOutcome.company_industry == industry)
        stmt = scope_by_organization_id(stmt, StrategyOutcome.organization_id, organization_id)

        rows = self.session.exec(stmt).all()
        results = []
        for row in rows:
            total = int(row.total or 0)
            wins = int(row.wins or 0)
            results.append(
                {
                    "signal_type": row.signal_type,
                    "playbook": row.playbook,
                    "channel": row.channel,
                    "generator": row.generator,
                    "total": total,
                    "wins": wins,
                    "win_rate": wins / total if total > 0 else 0.0,
                    "avg_days": float(row.avg_days) if row.avg_days is not None else None,
                }
            )
        # Sort by win_rate DESC, then by total DESC as tiebreaker.
        return sorted(results, key=lambda r: (r["win_rate"], r["total"]), reverse=True)
