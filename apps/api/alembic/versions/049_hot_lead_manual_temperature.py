"""Manual temperature on hot leads.

Revision ID: 049_hot_lead_manual_temperature
Revises: 048_opportunity_color

Adds hot_lead_scores.manual_temperature — a person's override (0-100) of
the computed research intensity, set from the hive. Nullable: existing
rows keep following BEE's own score.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "049_hot_lead_manual_temperature"
down_revision: str | None = "048_opportunity_color"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("hot_lead_scores", sa.Column("manual_temperature", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("hot_lead_scores", "manual_temperature")
