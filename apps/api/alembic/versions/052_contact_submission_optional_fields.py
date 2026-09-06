"""Contact submissions: name and message become optional.

The landing's primary CTA is now a waitlist, and it posts to the same
``POST /api/v1/contact`` the /contacto page already uses (see that
endpoint's docstring — it is already public, honeypot-guarded, per-IP rate
limited and, crucially, persists every submission unconditionally). A
waitlist signup asks for an email and nothing else: every extra field on a
one-line signup costs conversions, and someone joining a waiting list has
no message to write.

The alternative — a second table plus a second public endpoint — would have
duplicated the abuse protection that took real thought the first time, for
two columns' worth of difference. ``source`` already distinguishes the two
kinds of row ("waitlist_hero" vs the /contacto values), which is what
whoever triages them actually filters on.

Existing rows are unaffected: widening NOT NULL to NULL never invalidates
data that is already there.

Revision ID: 052_contact_submission_optional_fields
Revises: 051_assistant_conversations
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "052_contact_submission_optional_fields"
down_revision: str | None = "051_assistant_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("contact_submissions", "full_name", existing_type=sa.String(length=255), nullable=True)
    op.alter_column("contact_submissions", "message", existing_type=sa.String(length=4000), nullable=True)


def downgrade() -> None:
    # A row written by the waitlist form has no name and no message, so the
    # column cannot simply be narrowed back — backfill first, or the ALTER
    # fails on exactly the rows this migration exists to allow.
    op.execute("UPDATE contact_submissions SET full_name = '' WHERE full_name IS NULL")
    op.execute("UPDATE contact_submissions SET message = '' WHERE message IS NULL")
    op.alter_column("contact_submissions", "message", existing_type=sa.String(length=4000), nullable=False)
    op.alter_column("contact_submissions", "full_name", existing_type=sa.String(length=255), nullable=False)
