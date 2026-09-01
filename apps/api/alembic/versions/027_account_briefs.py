"""Account briefs — AccountResearchAgent's persistent research output.

Revision ID: 027_account_briefs
Revises: 026_market_scan_scaffold

See app.models.account_brief and app.services.account_research. Additive
only — ACCOUNT_RESEARCH_ENABLED defaults to false, so this table starts
empty and stays empty until deliberately turned on, same rollout shape as
026's market_scan_logs.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "027_account_briefs"
down_revision: str | None = "026_market_scan_scaffold"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "account_briefs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("summary", sa.String(), nullable=False),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=False),
        sa.Column("generated_by", sa.String(), nullable=False),
        sa.Column("model_used", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_account_briefs_id"), "account_briefs", ["id"], unique=False)
    op.create_index(
        op.f("ix_account_briefs_organization_id"), "account_briefs", ["organization_id"], unique=False
    )
    op.create_index(
        op.f("ix_account_briefs_company_id"), "account_briefs", ["company_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_account_briefs_company_id"), table_name="account_briefs")
    op.drop_index(op.f("ix_account_briefs_organization_id"), table_name="account_briefs")
    op.drop_index(op.f("ix_account_briefs_id"), table_name="account_briefs")
    op.drop_table("account_briefs")
