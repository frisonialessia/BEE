"""MessageTemplate — reusable outreach content.

Sequences today reference an ``artifact_type`` per step, but every send still
has to be freshly generated (rule-based or LLM) — there is no library of
actual, rep-written content to reuse or fall back to. This model is that
library: a named template per channel, with ``{{variable}}`` placeholders
a rep fills in by hand (first_name, company_name, etc.) — no templating
engine, just simple string interpolation done by the caller.
"""

import uuid
from typing import TYPE_CHECKING

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover
    pass


class MessageTemplate(TimestampMixin, table=True):
    """A reusable message a rep (or a sequence step) can send as-is."""

    __tablename__ = "message_templates"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary — same nullable-for-legacy convention as every other
    # org-scoped model in this codebase.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    created_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")

    name: str = Field(index=True, nullable=False)
    # email | linkedin | other — free-form on purpose, matches
    # StepDefinition.channel's own convention (no enum there either).
    channel: str = Field(default="email", index=True)
    subject: str | None = Field(default=None)  # only meaningful for email
    body: str = Field(nullable=False)
