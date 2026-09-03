"""Daily digest settings on Organization.

Revision ID: 046_organization_daily_digest
Revises: 045_meeting_attendee_responses

Adds digest_webhook_url / digest_enabled / digest_hour_utc /
digest_last_sent_at — see app.models.organization and
app.services.digest. Defaults leave every existing organization with the
digest off and nothing configured, exactly the pre-migration behavior.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "046_organization_daily_digest"
down_revision: str | None = "045_meeting_attendee_responses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("digest_webhook_url", sa.String(), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("digest_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "organizations",
        sa.Column("digest_hour_utc", sa.Integer(), nullable=False, server_default="8"),
    )
    op.add_column("organizations", sa.Column("digest_last_sent_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "digest_last_sent_at")
    op.drop_column("organizations", "digest_hour_utc")
    op.drop_column("organizations", "digest_enabled")
    op.drop_column("organizations", "digest_webhook_url")
