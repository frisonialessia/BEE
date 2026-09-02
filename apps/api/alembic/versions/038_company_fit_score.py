"""Company.fit_score — server-persisted ICP fit (0-100), previously only
ever computed live in the frontend (lib/icp.ts's computeFitScore) with
nothing server-side able to sort, filter, or notify on it.

Revision ID: 038_company_fit_score
Revises: 037_opportunity_deal_context

Additive only, nullable — see app.models.company.Company.fit_score's own
comment for what NULL means here.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "038_company_fit_score"
down_revision: str | None = "037_opportunity_deal_context"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("fit_score", sa.Float(), nullable=True))
    op.create_index("ix_companies_fit_score", "companies", ["fit_score"])


def downgrade() -> None:
    op.drop_index("ix_companies_fit_score", table_name="companies")
    op.drop_column("companies", "fit_score")
