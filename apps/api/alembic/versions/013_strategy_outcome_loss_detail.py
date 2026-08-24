"""StrategyOutcome loss detail — feeds the vector store's cautionary patterns.

Revision ID: 013_strategy_outcome_loss_detail
Revises: 012_saved_views
Create Date: 2026-08-24

Adds ``loss_reason`` and ``competitor`` to ``strategy_outcomes`` — until now
these lived only on ``Opportunity`` (see ``009_opportunity_outcome_detail``),
so BEE's learning dataset (``StrategyOutcome``, "the memory of BEE" per its
own docstring) captured *that* a deal was lost but never *why*.
``FeedbackLoopService.record_outcome`` denormalizes both fields here at close
time, same pattern as every other column on this table, so
``_seed_loss_pattern`` can encode a real cautionary pattern (with its actual
loss reason and competitor) into the vector store without a join back to
``Opportunity``.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "013_strategy_outcome_loss_detail"
down_revision: str | None = "012_saved_views"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "strategy_outcomes", sa.Column("loss_reason", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "strategy_outcomes", sa.Column("competitor", sa.String(length=200), nullable=True)
    )
    op.create_index(
        op.f("ix_strategy_outcomes_loss_reason"),
        "strategy_outcomes",
        ["loss_reason"],
        unique=False,
    )

    # Backfill from Opportunity for already-closed LOST deals so historical
    # rows aren't silently excluded from the new cautionary-pattern seeding —
    # existing losses become learnable the moment this migration runs, not
    # only losses recorded from now on.
    op.execute(
        """
        UPDATE strategy_outcomes AS so
        SET loss_reason = o.loss_reason,
            competitor = o.competitor
        FROM opportunities AS o
        WHERE so.opportunity_id = o.id
          AND so.outcome = 'lost'
          AND (o.loss_reason IS NOT NULL OR o.competitor IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_strategy_outcomes_loss_reason"), table_name="strategy_outcomes")
    op.drop_column("strategy_outcomes", "competitor")
    op.drop_column("strategy_outcomes", "loss_reason")
