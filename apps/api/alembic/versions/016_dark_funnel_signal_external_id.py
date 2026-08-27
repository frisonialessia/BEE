"""Add external_id to dark_funnel_signals for webhook idempotency.

Revision ID: 016_dark_funnel_signal_external_id
Revises: 015_contact_submissions
Create Date: 2026-08-26

Without this, a retried/replayed dark-funnel webhook delivery (G2, LinkedIn
research, website visits) has no natural key to dedupe on, so
DarkFunnelService.ingest_signal double-counts it into
research_intensity_score and can re-flip is_hot / re-trigger hot-lead
alerts on every duplicate delivery. See app.models.dark_funnel.DarkFunnelSignal
and app.services.dark_funnel.service.DarkFunnelService.ingest_signal.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "016_dark_funnel_external_id"
# NOTE: shortened from "016_dark_funnel_signal_external_id" (34 chars) —
# see 005's note on why (VARCHAR(32) version_num column).
down_revision: str | None = "015_contact_submissions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "dark_funnel_signals",
        sa.Column("external_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.create_index(
        op.f("ix_dark_funnel_signals_external_id"),
        "dark_funnel_signals",
        ["external_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dark_funnel_signals_external_id"), table_name="dark_funnel_signals")
    op.drop_column("dark_funnel_signals", "external_id")
