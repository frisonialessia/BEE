"""Add seniority to dynamic_sequences (target-segment filter).

Revision ID: 019_sequence_seniority
Revises: 018_integration_connections
Create Date: 2026-08-28

Same free-form convention as the existing signal_type/industry columns on
this table, and as Lead.seniority itself — see app.models.sequence for the
canonical value set (c_level/vp/director/manager/ic) this is expected to
hold, though nothing here enforces it at the DB level.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "019_sequence_seniority"
down_revision: str | None = "018_integration_connections"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dynamic_sequences", sa.Column("seniority", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("dynamic_sequences", "seniority")
