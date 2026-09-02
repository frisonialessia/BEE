"""Revenue Continuity Radar — Opportunity.opportunity_type.

Revision ID: 031_opportunity_type
Revises: 030_autopilot_configs

Adds ``opportunity_type`` (new_logo | expansion | renewal_risk) to
``opportunities``. See app.models.base's OPPORTUNITY_TYPES comment for why
this is a plain indexed string column rather than a native Postgres ENUM
type. Additive only, backfilled to 'new_logo' for every existing row — no
existing opportunity's classification changes; only opportunities created
from now on for a company that already has a WON opportunity get
classified as 'expansion'/'renewal_risk' by RevenueContinuityService.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "031_opportunity_type"
down_revision: str | None = "030_autopilot_configs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "opportunities",
        sa.Column(
            "opportunity_type", sa.String(length=32), nullable=False, server_default="new_logo"
        ),
    )
    op.create_index(
        op.f("ix_opportunities_opportunity_type"),
        "opportunities",
        ["opportunity_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_opportunities_opportunity_type"), table_name="opportunities")
    op.drop_column("opportunities", "opportunity_type")
