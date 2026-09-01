"""Add revenue_range to companies.

Revision ID: 022_company_revenue_range
Revises: 021_opportunity_attributes

Buyer-persona/ICP accuracy: Priority Matrix fit scoring gains a
revenue-band dimension alongside industry/size/country. Free text, not a
fixed enum — same reasoning as Company.size's own docstring: enrichment
providers report revenue in too many inconsistent shapes to force into a
closed set (unlike Organization.employee_range, which is a human filling
in a dropdown about their own company).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "022_company_revenue_range"
down_revision: str | None = "021_opportunity_attributes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("revenue_range", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("companies", "revenue_range")
