"""Saved list-page views.

Revision ID: 012_saved_views
Revises: 011_outbound_webhooks
Create Date: 2026-08-24

Adds ``saved_views`` — a named, reusable filter/sort configuration for a
list page (see app.models.saved_view for the rationale). A single
``create_table`` with inline FKs, so downgrade just drops the table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "012_saved_views"
down_revision: str | None = "011_outbound_webhooks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_views",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("page", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_saved_views_id"), "saved_views", ["id"], unique=False)
    op.create_index(op.f("ix_saved_views_organization_id"), "saved_views", ["organization_id"], unique=False)
    op.create_index(
        op.f("ix_saved_views_created_by_user_id"), "saved_views", ["created_by_user_id"], unique=False
    )
    op.create_index(op.f("ix_saved_views_page"), "saved_views", ["page"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_saved_views_page"), table_name="saved_views")
    op.drop_index(op.f("ix_saved_views_created_by_user_id"), table_name="saved_views")
    op.drop_index(op.f("ix_saved_views_organization_id"), table_name="saved_views")
    op.drop_index(op.f("ix_saved_views_id"), table_name="saved_views")
    op.drop_table("saved_views")
