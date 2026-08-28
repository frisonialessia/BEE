"""Add instance_url to integration_connections (Salesforce integration).

Revision ID: 020_integration_instance_url
Revises: 019_sequence_seniority

Salesforce OAuth returns a per-org instance URL alongside the token —
every subsequent API call must target it instead of a fixed host. Null for
every other provider (Gmail/LinkedIn don't need it) — see
app.models.integration_connection.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "020_integration_instance_url"
down_revision: str | None = "019_sequence_seniority"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("integration_connections", sa.Column("instance_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("integration_connections", "instance_url")
