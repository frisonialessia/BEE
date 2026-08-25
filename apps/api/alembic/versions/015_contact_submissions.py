"""Contact form submissions from the public marketing site.

Revision ID: 015_contact_submissions
Revises: 014_backfill_strategy_outcome_deal_value
Create Date: 2026-08-25

Adds ``contact_submissions`` — leads captured from the public /contacto
page (see app.models.contact_submission for why this is a distinct table
from ``leads``: no organization_id, there's no tenant yet). A single
``create_table`` with no FKs, so downgrade just drops the table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "015_contact_submissions"
down_revision: str | None = "014_backfill_strategy_outcome_deal_value"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "contact_submissions",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("company_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("phone", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
        sa.Column("message", sqlmodel.sql.sqltypes.AutoString(length=4000), nullable=False),
        sa.Column("source", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(length=32), nullable=False),
        sa.Column("ip_address", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contact_submissions_id"), "contact_submissions", ["id"], unique=False)
    op.create_index(op.f("ix_contact_submissions_email"), "contact_submissions", ["email"], unique=False)
    op.create_index(op.f("ix_contact_submissions_status"), "contact_submissions", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_contact_submissions_status"), table_name="contact_submissions")
    op.drop_index(op.f("ix_contact_submissions_email"), table_name="contact_submissions")
    op.drop_index(op.f("ix_contact_submissions_id"), table_name="contact_submissions")
    op.drop_table("contact_submissions")
