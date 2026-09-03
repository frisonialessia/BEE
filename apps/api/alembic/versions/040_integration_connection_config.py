"""Add config to integration_connections (provider-specific settings).

Revision ID: 040_integration_connection_config
Revises: 039_meeting_completed_at

Same JSON "schema stays stable while integrations evolve" column pattern
as Opportunity.attributes/Company.attributes — needed by the Jira
connector to store a per-connection target project key
({"project_key": "SALES"}) without a Jira-only column. See
IntegrationConnection.config's own docstring and
app.services.workflow_orchestrator.handlers.JiraSyncHandler.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "040_integration_connection_config"
down_revision: str | None = "039_meeting_completed_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable at the DB level, same as every other JSON column added
    # after its table's baseline — the SQLModel field's
    # default_factory=dict handles "empty" at the application layer
    # instead of a server_default.
    op.add_column("integration_connections", sa.Column("config", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("integration_connections", "config")
