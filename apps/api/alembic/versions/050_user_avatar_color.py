"""User avatar color.

Revision ID: 050_user_avatar_color
Revises: 049_hot_lead_manual_temperature

Adds users.avatar_color — a person's own pick among BEE's 6 chart tones
for their avatar's initials background (see AvatarColor in
schemas/auth.py). Nullable: an existing user just falls back to a
deterministic per-id tone on the frontend until they pick one.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "050_user_avatar_color"
down_revision: str | None = "049_hot_lead_manual_temperature"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_color", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_color")
