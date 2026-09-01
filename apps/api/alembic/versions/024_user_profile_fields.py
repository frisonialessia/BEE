"""Add avatar_url, phone, bio to users.

Revision ID: 024_user_profile_fields
Revises: 023_company_owner_user_id

Self-service profile fields (PATCH /users/me) — see app.models.user's
docstring. All nullable, no backfill: "not filled in yet" is the expected
starting state for every existing account.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "024_user_profile_fields"
down_revision: str | None = "023_company_owner_user_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "bio")
    op.drop_column("users", "phone")
    op.drop_column("users", "avatar_url")
