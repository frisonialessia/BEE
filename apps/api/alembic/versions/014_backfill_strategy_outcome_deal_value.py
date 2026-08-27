"""Backfill StrategyOutcome.deal_value/cycle_days for already-closed WON deals.

Revision ID: 014_backfill_strategy_outcome_deal_value
Revises: 013_strategy_outcome_loss_detail
Create Date: 2026-08-24

Pure data migration — no schema change. Both columns already existed in the
baseline schema (``deal_value``, ``cycle_days`` on ``strategy_outcomes``) but
nothing ever wrote them:

* ``FeedbackLoopService.record_outcome`` never set them (fixed in this same
  change — now sets ``deal_value=opportunity.amount`` on WON, and
  ``cycle_days`` from the originating Signal's ``detected_at``).
* ``ScenarioSimulator._get_historical_stats`` also compared
  ``StrategyOutcome.outcome == "WON"`` (uppercase) against a column that only
  ever holds lowercase ``"won"``/``"lost"`` — the same class of bug already
  fixed once in ``AnomalyDetector`` this session — so it silently matched
  zero rows and every dollar/win-rate projection was either ~0% or fell back
  to an assumed industry-default deal value, dressed up as if it were real
  historical data.

This backfill makes existing closed deals immediately usable by the fixed
simulator instead of only deals closed from now on.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "014_backfill_deal_value"
# NOTE: shortened from "014_backfill_strategy_outcome_deal_value" (40 chars)
# — see 005's note on why (VARCHAR(32) version_num column).
down_revision: str | None = "013_strategy_outcome_loss_detail"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE strategy_outcomes AS so
        SET deal_value = o.amount
        FROM opportunities AS o
        WHERE so.opportunity_id = o.id
          AND so.outcome = 'won'
          AND so.deal_value IS NULL
          AND o.amount IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE strategy_outcomes AS so
        SET cycle_days = GREATEST(0, EXTRACT(DAY FROM (so.closed_at - s.detected_at))::int)
        FROM signals AS s
        WHERE so.signal_id = s.id
          AND so.cycle_days IS NULL
          AND s.detected_at IS NOT NULL
          AND so.closed_at IS NOT NULL
        """
    )


def downgrade() -> None:
    # Backfill-only migration — no schema to revert. Leaving the backfilled
    # values in place on downgrade is intentional: they are correct
    # regardless of which migration state the schema is in.
    pass
