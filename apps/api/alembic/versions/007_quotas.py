"""Revenue quotas.

Revision ID: 007_quotas
Revises: 006_message_templates
Create Date: 2026-08-23

Adds ``quotas`` — a target amount for a rep OR a team over a period (see
app.models.quota for why there's no separate Territory table).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007_quotas"
down_revision: str | None = "006_message_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quotas",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("team_id", sa.Uuid(), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("target_amount", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quotas_id"), "quotas", ["id"], unique=False)
    op.create_index(op.f("ix_quotas_organization_id"), "quotas", ["organization_id"], unique=False)
    op.create_index(op.f("ix_quotas_user_id"), "quotas", ["user_id"], unique=False)
    op.create_index(op.f("ix_quotas_team_id"), "quotas", ["team_id"], unique=False)
    op.create_index(op.f("ix_quotas_period_start"), "quotas", ["period_start"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_quotas_period_start"), table_name="quotas")
    op.drop_index(op.f("ix_quotas_team_id"), table_name="quotas")
    op.drop_index(op.f("ix_quotas_user_id"), table_name="quotas")
    op.drop_index(op.f("ix_quotas_organization_id"), table_name="quotas")
    op.drop_index(op.f("ix_quotas_id"), table_name="quotas")
    op.drop_table("quotas")
