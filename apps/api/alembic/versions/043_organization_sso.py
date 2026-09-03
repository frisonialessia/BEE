"""Enterprise SSO fields on Organization.

Revision ID: 043_organization_sso
Revises: 042_organization_deletion_request

Adds sso_enabled / sso_connection_id / sso_domain — see
app.models.organization and app.services.sso for the full contract. All
three default to their "SSO not configured" state (False / NULL / NULL),
so every existing organization keeps logging in with a password exactly as
before this migration.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "043_organization_sso"
down_revision: str | None = "042_organization_deletion_request"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("sso_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("organizations", sa.Column("sso_connection_id", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("sso_domain", sa.String(), nullable=True))
    op.create_index(
        "ix_organizations_sso_domain", "organizations", ["sso_domain"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_organizations_sso_domain", table_name="organizations")
    op.drop_column("organizations", "sso_domain")
    op.drop_column("organizations", "sso_connection_id")
    op.drop_column("organizations", "sso_enabled")
