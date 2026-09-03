"""GDPR deletion-request fields on Organization.

Revision ID: 042_organization_deletion_request
Revises: 041_admin_audit_log

Adds deletion_requested_at / deletion_requested_by_user_id — see
app.models.organization for why this records a REQUEST rather than
performing the erasure itself, and why deletion_requested_by_user_id is
deliberately NOT a real foreign key (a second FK from organizations to
users makes the existing Organization.users relationship's join
ambiguous — see that field's own comment).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "042_organization_deletion_request"
down_revision: str | None = "041_admin_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("deletion_requested_at", sa.DateTime(), nullable=True))
    op.add_column("organizations", sa.Column("deletion_requested_by_user_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "deletion_requested_by_user_id")
    op.drop_column("organizations", "deletion_requested_at")
