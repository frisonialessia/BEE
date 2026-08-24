"""Org-configured outbound webhooks.

Revision ID: 011_outbound_webhooks
Revises: 010_opportunity_tasks
Create Date: 2026-08-24

Adds ``outbound_webhooks`` — any org can register its own webhook URL(s) and
pick which BEE events it wants to receive (see
app.models.outbound_webhook for the rationale). A single ``create_table``
with inline FKs, so downgrade just drops the table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "011_outbound_webhooks"
down_revision: str | None = "010_opportunity_tasks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outbound_webhooks",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("url", sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=False),
        sa.Column("secret", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("secret_preview", sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column("event_types", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_triggered_at", sa.DateTime(), nullable=True),
        sa.Column("last_status", sqlmodel.sql.sqltypes.AutoString(length=16), nullable=True),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_outbound_webhooks_id"), "outbound_webhooks", ["id"], unique=False)
    op.create_index(
        op.f("ix_outbound_webhooks_organization_id"), "outbound_webhooks", ["organization_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_outbound_webhooks_organization_id"), table_name="outbound_webhooks")
    op.drop_index(op.f("ix_outbound_webhooks_id"), table_name="outbound_webhooks")
    op.drop_table("outbound_webhooks")
