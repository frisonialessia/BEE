"""Opportunity follow-up tasks.

Revision ID: 010_opportunity_tasks
Revises: 009_opportunity_outcome_detail
Create Date: 2026-08-24

Adds ``opportunity_tasks`` — a lightweight to-do per opportunity (see
app.models.opportunity_task for the rationale). A single ``create_table``
with inline FKs, so downgrade just drops the table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "010_opportunity_tasks"
down_revision: str | None = "009_opportunity_outcome_detail"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "opportunity_tasks",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=300), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"]),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_opportunity_tasks_id"), "opportunity_tasks", ["id"], unique=False)
    op.create_index(
        op.f("ix_opportunity_tasks_organization_id"), "opportunity_tasks", ["organization_id"], unique=False
    )
    op.create_index(
        op.f("ix_opportunity_tasks_opportunity_id"), "opportunity_tasks", ["opportunity_id"], unique=False
    )
    op.create_index(
        op.f("ix_opportunity_tasks_assigned_to_user_id"),
        "opportunity_tasks",
        ["assigned_to_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_opportunity_tasks_due_at"), "opportunity_tasks", ["due_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_opportunity_tasks_due_at"), table_name="opportunity_tasks")
    op.drop_index(op.f("ix_opportunity_tasks_assigned_to_user_id"), table_name="opportunity_tasks")
    op.drop_index(op.f("ix_opportunity_tasks_opportunity_id"), table_name="opportunity_tasks")
    op.drop_index(op.f("ix_opportunity_tasks_organization_id"), table_name="opportunity_tasks")
    op.drop_index(op.f("ix_opportunity_tasks_id"), table_name="opportunity_tasks")
    op.drop_table("opportunity_tasks")
