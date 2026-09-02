"""Team calendar — meetings.

Revision ID: 034_meetings
Revises: 033_lead_deal_context

Adds ``meetings`` (see app.models.meeting for the rationale — its own
model, not an OpportunityTask extension). Single ``create_table`` with
inline FKs, so downgrade just drops the table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "034_meetings"
down_revision: str | None = "033_lead_deal_context"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meetings",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("opportunity_id", sa.Uuid(), nullable=True),
        sa.Column("lead_id", sa.Uuid(), nullable=True),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=300), nullable=False),
        sa.Column("purpose", sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("meeting_url", sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column("attendee_user_ids", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"]),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_meetings_id"), "meetings", ["id"], unique=False)
    op.create_index(op.f("ix_meetings_organization_id"), "meetings", ["organization_id"], unique=False)
    op.create_index(op.f("ix_meetings_created_by_user_id"), "meetings", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_meetings_opportunity_id"), "meetings", ["opportunity_id"], unique=False)
    op.create_index(op.f("ix_meetings_lead_id"), "meetings", ["lead_id"], unique=False)
    op.create_index(op.f("ix_meetings_starts_at"), "meetings", ["starts_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_meetings_starts_at"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_lead_id"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_opportunity_id"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_created_by_user_id"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_organization_id"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_id"), table_name="meetings")
    op.drop_table("meetings")
