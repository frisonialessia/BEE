"""Add owner_user_id to companies.

Revision ID: 023_company_owner_user_id
Revises: 022_company_revenue_range

Extends per-rep ownership (already on Lead/Opportunity via
assigned_to_user_id) to Company — see app.models.company's docstring for
why a nullable FK, no backfill, and "untagged = shared" convention.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "023_company_owner_user_id"
down_revision: str | None = "022_company_revenue_range"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("owner_user_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_companies_owner_user_id"), "companies", ["owner_user_id"], unique=False
    )
    op.create_foreign_key(
        "fk_companies_owner_user_id_users",
        "companies",
        "users",
        ["owner_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_companies_owner_user_id_users", "companies", type_="foreignkey")
    op.drop_index(op.f("ix_companies_owner_user_id"), table_name="companies")
    op.drop_column("companies", "owner_user_id")
