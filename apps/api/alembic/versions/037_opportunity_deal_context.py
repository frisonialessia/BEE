"""Opportunity deal-context fields — source, next_meeting_at,
meetings_held_count, photo_url. Mirrors Lead's own deal-context fields
(migration 033) for parity between the two manual-creation forms.

Revision ID: 037_opportunity_deal_context
Revises: 036_user_timezone

Additive only, all nullable (meetings_held_count defaults to 0 server-side
too, so existing rows read as "no prior meetings" rather than NULL).
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "037_opportunity_deal_context"
down_revision: str | None = "036_user_timezone"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "opportunities", sa.Column("source", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True)
    )
    op.add_column("opportunities", sa.Column("next_meeting_at", sa.DateTime(), nullable=True))
    op.add_column(
        "opportunities",
        sa.Column("meetings_held_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "opportunities",
        sa.Column("photo_url", sqlmodel.sql.sqltypes.AutoString(length=300_000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("opportunities", "photo_url")
    op.drop_column("opportunities", "meetings_held_count")
    op.drop_column("opportunities", "next_meeting_at")
    op.drop_column("opportunities", "source")
