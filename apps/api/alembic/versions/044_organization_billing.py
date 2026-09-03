"""Billing fields on Organization.

Revision ID: 044_organization_billing
Revises: 043_organization_sso

Adds stripe_customer_id / stripe_subscription_id / stripe_subscription_status
— see app.models.organization and app.services.billing for the full
contract. All three default to NULL ("no paid subscription on record"),
so every existing organization is unaffected by this migration; nothing
in this codebase reads these to gate access (see that module's own
docstring for why this is scaffolding, not enforcement).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "044_organization_billing"
down_revision: str | None = "043_organization_sso"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("stripe_customer_id", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("stripe_subscription_id", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("stripe_subscription_status", sa.String(), nullable=True))
    op.create_index(
        "ix_organizations_stripe_customer_id", "organizations", ["stripe_customer_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_organizations_stripe_customer_id", table_name="organizations")
    op.drop_column("organizations", "stripe_subscription_status")
    op.drop_column("organizations", "stripe_subscription_id")
    op.drop_column("organizations", "stripe_customer_id")
