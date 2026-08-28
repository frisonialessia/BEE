"""Add industry/employee_range/website to organizations (company profile).

Revision ID: 017_organization_profile
Revises: 016_dark_funnel_external_id
Create Date: 2026-08-28

Collected as a progressive onboarding step in-app (see
app.api.v1.endpoints.organizations), not at registration — keeps signup to
its existing 4 fields. All three columns are nullable: "not set yet" is a
valid, expected state, same convention as Organization.icp_criteria's empty
lists — never treat a null employee_range as "0 employees".
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "017_organization_profile"
down_revision: str | None = "016_dark_funnel_external_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("industry", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("employee_range", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("website", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "website")
    op.drop_column("organizations", "employee_range")
    op.drop_column("organizations", "industry")
