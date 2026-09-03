"""General admin audit log — "who changed what".

Revision ID: 041_admin_audit_log
Revises: 040_integration_connection_config

Adds ``admin_audit_logs`` — distinct from ``audit_entries`` (an AI agent's
own decision log), this is the general "a human did X" trail for
security-relevant admin actions (role changes, user deletion, API key
create/revoke, integration connect/disconnect, ICP criteria changes) that
never existed before. See app.models.admin_audit_log for the rationale.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "041_admin_audit_log"
down_revision: str | None = "040_integration_connection_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_logs",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("entity_type", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("summary", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("ip_address", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_admin_audit_logs_id"), "admin_audit_logs", ["id"], unique=False)
    op.create_index(
        op.f("ix_admin_audit_logs_organization_id"), "admin_audit_logs", ["organization_id"], unique=False
    )
    op.create_index(op.f("ix_admin_audit_logs_actor_user_id"), "admin_audit_logs", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_admin_audit_logs_action"), "admin_audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_admin_audit_logs_entity_id"), "admin_audit_logs", ["entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_audit_logs_entity_id"), table_name="admin_audit_logs")
    op.drop_index(op.f("ix_admin_audit_logs_action"), table_name="admin_audit_logs")
    op.drop_index(op.f("ix_admin_audit_logs_actor_user_id"), table_name="admin_audit_logs")
    op.drop_index(op.f("ix_admin_audit_logs_organization_id"), table_name="admin_audit_logs")
    op.drop_index(op.f("ix_admin_audit_logs_id"), table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")
