"""Opportunity personal color tag.

Revision ID: 048_opportunity_color
Revises: 047_team_currency_quota_count

Adds opportunities.color — the same nine BEE color tokens a meeting can
carry (see 044/Meeting.color), picked by hand in the opportunity panel so
an account reads the same on the calendar and in the CRM. Nullable:
existing rows simply have no color, exactly as before.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "048_opportunity_color"
down_revision: str | None = "047_team_currency_quota_count"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("opportunities", sa.Column("color", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("opportunities", "color")
