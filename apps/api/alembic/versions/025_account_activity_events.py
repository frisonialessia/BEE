"""Create account_activity_events.

Revision ID: 025_account_activity_events
Revises: 024_user_profile_fields

Real per-account human activity feed — see app.models.account_activity's
docstring for why this is a new, separate table from audit_entries (agent
decisions) rather than an extension of it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "025_account_activity_events"
down_revision: str | None = "024_user_profile_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "account_activity_events",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_account_activity_events_id"), "account_activity_events", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_account_activity_events_organization_id"),
        "account_activity_events",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_account_activity_events_company_id"),
        "account_activity_events",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_account_activity_events_user_id"),
        "account_activity_events",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_account_activity_events_event_type"),
        "account_activity_events",
        ["event_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_account_activity_events_event_type"), table_name="account_activity_events")
    op.drop_index(op.f("ix_account_activity_events_user_id"), table_name="account_activity_events")
    op.drop_index(op.f("ix_account_activity_events_company_id"), table_name="account_activity_events")
    op.drop_index(
        op.f("ix_account_activity_events_organization_id"), table_name="account_activity_events"
    )
    op.drop_index(op.f("ix_account_activity_events_id"), table_name="account_activity_events")
    op.drop_table("account_activity_events")
