"""Meeting.color — personal color tag picked by whoever creates the meeting.

Revision ID: 035_meeting_color
Revises: 034_meetings

See app.models.meeting.Meeting's own comment on this field. Additive
only, nullable — falls back to the existing client_context-based tone.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "035_meeting_color"
down_revision: str | None = "034_meetings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "meetings", sa.Column("color", sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("meetings", "color")
