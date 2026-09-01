"""AccountActivityEvent — real human activity on a Company, not agent decisions.

Deliberately separate from ``AuditEntry`` (``app.models.audit_trail``), which
records *AI agent* decisions (strategy generated, signal classified) with a
full context/output snapshot for observability. This model answers a much
smaller, different question: "who on my team looked at or touched this
account, and when" — the CRM-style presence/activity feed a distributed
sales team actually wants (see ``docs/`` RBAC proposal, gap C). No JSON
snapshot, no confidence score — just who, what, when, on which account.
"""

from __future__ import annotations

import uuid
from enum import Enum

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class AccountActivityEventType(str, Enum):
    """What kind of interaction with a company this event records."""

    VIEWED = "viewed"
    EDITED = "edited"
    ASSIGNED = "assigned"


class AccountActivityEvent(TimestampMixin, table=True):
    """A single human interaction with a :class:`~app.models.company.Company`.

    Append-only — never updated after insert, same posture as ``AuditEntry``.
    ``created_at`` (from ``TimestampMixin``) is the event timestamp.
    """

    __tablename__ = "account_activity_events"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True, nullable=False)
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True, nullable=False)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)

    event_type: AccountActivityEventType = Field(index=True)
