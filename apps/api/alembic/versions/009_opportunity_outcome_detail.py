"""Opportunity outcome detail — Win/Loss Analysis.

Revision ID: 009_opportunity_outcome_detail
Revises: 008_organization_icp_criteria
Create Date: 2026-08-24

Adds three fields to ``opportunities`` so a genuine Win/Loss Analysis view can
be built client-side from the same bulk opportunity list Pronóstico/Tendencias
already fetch (same pattern as the rest of BEE's hand-rolled BI — no new
aggregation endpoint):

* ``loss_reason`` — a small fixed picklist (price/budget/timing/competitor/
  no_decision/lost_champion/product_fit/no_response/other), captured by the
  rep when marking a deal LOST via ``PATCH /opportunities/{id}/outcome``.
  Plain string column, not a DB enum, so the set can grow later without
  another migration. Only ever set when the outcome is LOST.
* ``competitor`` — free-text competitor name: who won the deal (LOST) or was
  beaten (WON). Optional either way.
* ``closed_at`` — timestamp the outcome was recorded. Was previously only
  persisted on ``StrategyOutcome`` (backend-internal); exposing it directly on
  ``Opportunity`` lets the frontend compute an accurate days-to-close instead
  of approximating with ``updated_at`` (see ``lib/trends.ts``'s own comment
  about that gap).

Backfills ``closed_at`` for existing WON/LOST rows from ``updated_at`` — the
same approximation the frontend already made implicitly, so historical deals
don't suddenly disappear from days-to-close/win-rate-trend calculations.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "009_opportunity_outcome_detail"
down_revision: str | None = "008_organization_icp_criteria"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "opportunities", sa.Column("loss_reason", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "opportunities", sa.Column("competitor", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "opportunities", sa.Column("closed_at", sa.DateTime(), nullable=True)
    )
    op.create_index(
        op.f("ix_opportunities_loss_reason"),
        "opportunities",
        ["loss_reason"],
        unique=False,
    )

    # Backfill closed_at for already-closed deals so historical win/loss data
    # isn't silently excluded from days-to-close calculations going forward.
    op.execute(
        """
        UPDATE opportunities
        SET closed_at = updated_at
        WHERE status IN ('WON', 'LOST') AND closed_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_opportunities_loss_reason"), table_name="opportunities")
    op.drop_column("opportunities", "closed_at")
    op.drop_column("opportunities", "competitor")
    op.drop_column("opportunities", "loss_reason")
