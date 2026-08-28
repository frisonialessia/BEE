"""Add integration_connections (per-org OAuth connections, e.g. Gmail).

Revision ID: 018_integration_connections
Revises: 017_organization_profile
Create Date: 2026-08-28

See app.models.integration_connection for the full rationale. One row per
(organization, provider); tokens are stored encrypted (app.core.token_crypto),
never in plaintext.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "018_integration_connections"
down_revision: str | None = "017_organization_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "integration_connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("connected_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("external_account_email", sa.String(), nullable=True),
        sa.Column("access_token_encrypted", sa.String(), nullable=False),
        sa.Column("refresh_token_encrypted", sa.String(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("scopes", sa.String(), nullable=True),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["connected_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "provider", name="uq_integration_org_provider"),
    )
    op.create_index(
        op.f("ix_integration_connections_id"), "integration_connections", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_integration_connections_organization_id"),
        "integration_connections",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_integration_connections_provider"), "integration_connections", ["provider"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_integration_connections_provider"), table_name="integration_connections")
    op.drop_index(op.f("ix_integration_connections_organization_id"), table_name="integration_connections")
    op.drop_index(op.f("ix_integration_connections_id"), table_name="integration_connections")
    op.drop_table("integration_connections")
