"""Add attributes to opportunities (provider-specific bookkeeping).

Revision ID: 021_opportunity_attributes
Revises: 020_integration_instance_url

Same JSON "schema stays stable while integrations evolve" column Company
and Lead already have — Opportunity was the one core entity missing it.
Needed by SalesforceImportService to record {"salesforce_id": "..."} for
idempotent re-import (see app.services.integrations.salesforce_import).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "021_opportunity_attributes"
down_revision: str | None = "020_integration_instance_url"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable at the DB level, same as Company.attributes/Lead.attributes in
    # the baseline schema — the SQLModel field's default_factory=dict handles
    # "empty" at the application layer instead of a server_default.
    op.add_column("opportunities", sa.Column("attributes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("opportunities", "attributes")
