"""Federated Signal Intelligence — Organization.federated_intelligence_opt_in.

Revision ID: 032_federated_intelligence_opt_in
Revises: 031_opportunity_type

See app.services.federated_intelligence and app.models.organization's
comment on this field. Additive only, defaults false — no existing
organization contributes to or benefits from cross-tenant priors until an
owner explicitly opts in.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "032_federated_intelligence_opt_in"
down_revision: str | None = "031_opportunity_type"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "federated_intelligence_opt_in",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "federated_intelligence_opt_in")
