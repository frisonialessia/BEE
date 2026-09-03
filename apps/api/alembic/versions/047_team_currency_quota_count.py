"""Team currency and client-count quotas.

Revision ID: 047_team_currency_quota_count
Revises: 046_organization_daily_digest

Adds teams.currency (ISO 4217, default USD) and quotas.target_count (a
number-of-new-clients target next to the revenue one) — see
app.models.team / app.models.quota. Existing rows keep USD and no count
target, exactly the pre-migration semantics.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "047_team_currency_quota_count"
down_revision: str | None = "046_organization_daily_digest"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"))
    op.add_column("quotas", sa.Column("target_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("quotas", "target_count")
    op.drop_column("teams", "currency")
