"""Attendee RSVP field on Meeting.

Revision ID: 045_meeting_attendee_responses
Revises: 044_organization_billing

Adds attendee_responses — see app.models.meeting for the contract. Default
empty JSON object, so every existing meeting reads as "nobody has
responded yet" for every attendee, exactly its intended semantics.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "045_meeting_attendee_responses"
down_revision: str | None = "044_organization_billing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("attendee_responses", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("meetings", "attendee_responses")
