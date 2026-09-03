"""Meeting.completed_at — set once a rep confirms a meeting actually
happened (POST /meetings/{id}/complete), the trigger for feeding it back
into Lead/Opportunity.meetings_held_count and an "engagement" Signal. See
app.models.meeting.Meeting.completed_at's own comment.

Revision ID: 039_meeting_completed_at
Revises: 038_company_fit_score

Additive only, nullable.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "039_meeting_completed_at"
down_revision: str | None = "038_company_fit_score"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("completed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("meetings", "completed_at")
