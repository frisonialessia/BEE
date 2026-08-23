"""Message template library.

Revision ID: 006_message_templates
Revises: 005_opportunity_forecasting_fields
Create Date: 2026-08-23

Adds ``message_templates`` — reusable, rep-written outreach content per
channel (see app.models.message_template for the rationale). A single
``create_table`` with inline FKs, so downgrade just drops the table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006_message_templates"
down_revision: str | None = "005_opportunity_forecasting_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "message_templates",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("channel", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("subject", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("body", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_message_templates_id"), "message_templates", ["id"], unique=False)
    op.create_index(
        op.f("ix_message_templates_organization_id"), "message_templates", ["organization_id"], unique=False
    )
    op.create_index(op.f("ix_message_templates_name"), "message_templates", ["name"], unique=False)
    op.create_index(op.f("ix_message_templates_channel"), "message_templates", ["channel"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_message_templates_channel"), table_name="message_templates")
    op.drop_index(op.f("ix_message_templates_name"), table_name="message_templates")
    op.drop_index(op.f("ix_message_templates_organization_id"), table_name="message_templates")
    op.drop_index(op.f("ix_message_templates_id"), table_name="message_templates")
    op.drop_table("message_templates")
