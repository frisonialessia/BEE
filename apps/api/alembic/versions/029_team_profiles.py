"""Team profiles — per-team signal weights and research focus.

Revision ID: 029_team_profiles
Revises: 028_password_reset_tokens

See app.models.team_profile and PUT/GET /teams/{team_id}/profile in
app.api.v1.endpoints.teams. Additive only.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "029_team_profiles"
down_revision: str | None = "028_password_reset_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("signal_weights", sa.JSON(), nullable=False),
        sa.Column("research_focus", sa.String(length=2000), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_team_profiles_team_id"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], name="fk_team_profiles_organization_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_team_profiles_id"), "team_profiles", ["id"], unique=False)
    op.create_index(op.f("ix_team_profiles_team_id"), "team_profiles", ["team_id"], unique=True)
    op.create_index(
        op.f("ix_team_profiles_organization_id"), "team_profiles", ["organization_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_team_profiles_organization_id"), table_name="team_profiles")
    op.drop_index(op.f("ix_team_profiles_team_id"), table_name="team_profiles")
    op.drop_index(op.f("ix_team_profiles_id"), table_name="team_profiles")
    op.drop_table("team_profiles")
