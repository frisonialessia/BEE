"""Assistant conversation history.

Revision ID: 051_assistant_conversations
Revises: 050_user_avatar_color

Adds assistant_conversations — see app.models.assistant_conversation for the
full contract (private per-user thread, JSON messages column, retention
swept lazily on list rather than a cron).
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "051_assistant_conversations"
down_revision: str | None = "050_user_avatar_color"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assistant_conversations",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("messages", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("last_message_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_assistant_conversations_id"), "assistant_conversations", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_assistant_conversations_organization_id"),
        "assistant_conversations",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_assistant_conversations_user_id"), "assistant_conversations", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_assistant_conversations_last_message_at"),
        "assistant_conversations",
        ["last_message_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_assistant_conversations_last_message_at"), table_name="assistant_conversations")
    op.drop_index(op.f("ix_assistant_conversations_user_id"), table_name="assistant_conversations")
    op.drop_index(op.f("ix_assistant_conversations_organization_id"), table_name="assistant_conversations")
    op.drop_index(op.f("ix_assistant_conversations_id"), table_name="assistant_conversations")
    op.drop_table("assistant_conversations")
