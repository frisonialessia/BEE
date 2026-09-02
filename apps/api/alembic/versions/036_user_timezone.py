"""User.timezone — IANA timezone name the user has chosen for their own
account, so every date/time the frontend renders (meetings above all)
displays in the timezone that person actually picked, not just whatever
the browser guesses.

Revision ID: 036_user_timezone
Revises: 035_meeting_color

Additive only, nullable — see app.models.user.User.timezone's own comment.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "036_user_timezone"
down_revision: str | None = "035_meeting_color"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("timezone", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "timezone")
