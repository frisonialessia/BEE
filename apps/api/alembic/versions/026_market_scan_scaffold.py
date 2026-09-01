"""Market scan scaffold — company scan cursor + MarketScanLog.

Revision ID: 026_market_scan_scaffold
Revises: 025_account_activity_events

Phase 1 of the proactive market-scan pipeline (background workers via
Vercel Cron — see app.services.market_scan). This migration only adds the
cursor columns and the audit table; no provider/analyzer code ships in this
revision, and MARKET_SCAN_ENABLED defaults to false, so the new tick
endpoint is a safe no-op until deliberately turned on.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "026_market_scan_scaffold"
down_revision: str | None = "025_account_activity_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("next_scan_due_at", sa.DateTime(), nullable=True))
    op.create_index(
        op.f("ix_companies_next_scan_due_at"), "companies", ["next_scan_due_at"], unique=False
    )
    op.add_column("companies", sa.Column("last_scanned_at", sa.DateTime(), nullable=True))

    op.create_table(
        "market_scan_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("companies_scanned", sa.Integer(), nullable=False),
        sa.Column("signals_created", sa.Integer(), nullable=False),
        sa.Column("errors", sa.JSON(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_market_scan_logs_id"), "market_scan_logs", ["id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_market_scan_logs_id"), table_name="market_scan_logs")
    op.drop_table("market_scan_logs")
    op.drop_column("companies", "last_scanned_at")
    op.drop_index(op.f("ix_companies_next_scan_due_at"), table_name="companies")
    op.drop_column("companies", "next_scan_due_at")
