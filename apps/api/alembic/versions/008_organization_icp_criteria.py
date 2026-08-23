"""Organization ICP criteria.

Revision ID: 008_organization_icp_criteria
Revises: 007_quotas
Create Date: 2026-08-23

Adds ``icp_criteria`` to ``organizations`` — the Ideal Customer Profile
definition (target industries/sizes/countries) the fit × intent priority
matrix computes company fit scores against. Empty JSON object by default,
meaning "not configured yet" for every existing organization.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "008_organization_icp_criteria"
down_revision: str | None = "007_quotas"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("icp_criteria", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("organizations", "icp_criteria")
