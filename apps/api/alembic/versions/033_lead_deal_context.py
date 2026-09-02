"""Lead deal context — estimated_value, source, next_meeting_at,
meetings_held_count, photo_url.

Revision ID: 033_lead_deal_context
Revises: 032_federated_intelligence_opt_in

See app.models.lead.Lead's own comments on these fields. Additive only,
every column nullable or defaulted — an existing lead row reads exactly as
it did before this migration.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "033_lead_deal_context"
down_revision: str | None = "032_federated_intelligence_opt_in"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("estimated_value", sa.Float(), nullable=True))
    op.add_column("leads", sa.Column("source", sa.String(length=128), nullable=True))
    op.add_column("leads", sa.Column("next_meeting_at", sa.DateTime(), nullable=True))
    op.add_column(
        "leads",
        sa.Column("meetings_held_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("leads", sa.Column("photo_url", sa.String(length=300_000), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "photo_url")
    op.drop_column("leads", "meetings_held_count")
    op.drop_column("leads", "next_meeting_at")
    op.drop_column("leads", "source")
    op.drop_column("leads", "estimated_value")
