"""Opportunity forecasting & MEDDIC qualification fields.

Revision ID: 005_opportunity_forecasting_fields
Revises: 004_organization_api_keys
Create Date: 2026-08-23

Adds three fields to ``opportunities`` so the pipeline can support real
revenue forecasting and structured deal qualification, both computed
client-side from the list endpoint (same pattern as the rest of BEE's
hand-rolled BI — no new aggregation service):

* ``amount`` — estimated deal value, the input every weighted-forecast
  number needs.
* ``expected_close_date`` — drives which forecast month a deal lands in,
  and is the basis for flagging a stale "at risk" deal.
* ``qualification`` — a MEDDIC checklist stored as a JSON bool map rather
  than fixed columns, so the set of criteria can change later (e.g. to
  BANT) without another migration. Existing rows get ``'{}'`` so every
  criterion reads as "not yet confirmed", never as "disqualified".
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_opportunity_forecasting_fields"
down_revision: str | None = "004_organization_api_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("opportunities", sa.Column("amount", sa.Float(), nullable=True))
    op.add_column(
        "opportunities", sa.Column("expected_close_date", sa.Date(), nullable=True)
    )
    op.add_column(
        "opportunities",
        sa.Column("qualification", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.create_index(
        op.f("ix_opportunities_expected_close_date"),
        "opportunities",
        ["expected_close_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_opportunities_expected_close_date"), table_name="opportunities"
    )
    op.drop_column("opportunities", "qualification")
    op.drop_column("opportunities", "expected_close_date")
    op.drop_column("opportunities", "amount")
