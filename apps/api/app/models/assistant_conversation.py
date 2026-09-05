"""AssistantConversation — a saved thread with BEE's AI Assistant.

``POST /assistant/chat`` itself stays exactly as stateless as it always
was (see ``AssistantChatIn``'s own docstring) — the client still sends the
whole message list on every turn. This model is what the endpoint reads
from and writes back to when a ``conversation_id`` is given, so closing
the tab and coming back later (or opening a past thread from a list)
doesn't lose anything, without changing the request/response shape the
frontend already builds around.

Private to the user who started it. Unlike ``MessageTemplate`` or an
``OpportunityTask``, a conversation with the assistant is never org-wide
or reassignable — a manager has no business browsing what a rep asked the
copilot, so this is always scoped to `user_id`, never widened via
``scope_by_organization_id``/``get_visible_user_ids`` the way those are.

Retention: swept lazily on every ``GET /assistant/conversations`` call
(see that endpoint) rather than a separate cron — old conversations get
deleted the next time the owner's list is read, past
``RETENTION_DAYS`` since their last real activity (``last_message_at``,
not ``created_at`` — a thread someone keeps coming back to shouldn't age
out just because it started long ago).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid, utcnow

RETENTION_DAYS = 90


class AssistantConversation(TimestampMixin, table=True):
    """One saved thread — a growing, ordered, append-only list of turns."""

    __tablename__ = "assistant_conversations"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary — same nullable-for-legacy convention as every other
    # org-scoped model in this codebase (see Organization's own docstring).
    # Not used to widen visibility the way MessageTemplate's is — see the
    # module docstring above.
    organization_id: uuid.UUID | None = Field(default=None, foreign_key="organizations.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)

    # Derived once from the first user message at creation time (see the
    # endpoint) and never re-derived afterward — a conversation's label in
    # a list shouldn't shift under the user's feet as they keep chatting.
    title: str = Field(max_length=200, nullable=False)

    # Schema: list of {role: "user"|"assistant", content: str, created_at: iso str}
    # dicts, in order — the exact shape AssistantMessageIn already sends,
    # always read/written wholesale as one thread, same pattern as
    # SequenceExecution.events (see models/sequence.py).
    messages: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))

    # What a conversation list sorts by and what the retention sweep counts
    # from — not created_at/updated_at, so a week-old thread someone just
    # reopened sorts to the top and doesn't get swept for another
    # RETENTION_DAYS.
    last_message_at: datetime = Field(default_factory=utcnow, nullable=False, index=True)
