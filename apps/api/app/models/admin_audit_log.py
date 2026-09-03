"""AdminAuditLog — "who changed what" for security-relevant admin actions.

Distinct from ``app.models.audit_trail.AuditEntry`` (an AI *agent's*
decision log — what a strategy generator/executive agent did and why,
keyed by confidence score) — this is the general admin trail that never
existed: a human actor changing a role, deleting a user, creating or
revoking an API key, connecting/disconnecting an integration, changing
org-wide settings (ICP criteria, ...). The kind of thing a compliance
review or "who did this?" incident response actually needs, and the kind
of thing an enterprise buyer's security questionnaire asks for by name.

Immutable, insert-only — same convention as ``AuditEntry``. ``action`` is
a free string (not an enum), same "a new action type needs no migration"
reasoning as ``IntegrationConnection.provider`` — see
``app.services.admin_audit.service`` for the catalog of actions actually
logged today and where each call site lives.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class AdminAuditLog(TimestampMixin, table=True):
    __tablename__ = "admin_audit_logs"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True, nullable=False)

    # Who did it. Nullable for the rare system-initiated action (none exist
    # yet, but the column shouldn't need a migration the day one does).
    actor_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)

    # e.g. "user.role_changed", "user.deleted", "api_key.created",
    # "integration.connected", "icp_criteria.updated" — see
    # app.services.admin_audit.service's ACTIONS catalog for the full list.
    action: str = Field(index=True, nullable=False)

    # What the action was about, when it's a specific record (a user, an
    # API key, an integration connection) rather than an org-wide setting.
    entity_type: str | None = Field(default=None)
    entity_id: uuid.UUID | None = Field(default=None, index=True)

    # Human-readable one-liner ("Changed Maria's role from member to
    # admin.") plus whatever structured before/after detail is relevant —
    # free-form JSON, same "new action types need no migration" reasoning
    # as `action` itself.
    summary: str = Field(nullable=False)
    detail: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Best-effort, same extraction as every rate-limit guard
    # (app.core.client_ip) — null when unavailable (e.g. a call made
    # outside an HTTP request context).
    ip_address: str | None = Field(default=None)
