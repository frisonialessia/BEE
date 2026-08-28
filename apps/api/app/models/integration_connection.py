"""IntegrationConnection — a per-organization, per-provider OAuth connection.

Distinct from the OmnichannelGateway's channel config (LINKEDIN_ACCESS_TOKEN,
EMAIL_SMTP_*, ...): those are single, server-wide credentials shared by every
tenant, set once by whoever deploys BEE. A row here is the opposite —
"this specific organization connected their own Gmail account", surfaced as
a real Connect/Disconnect button at /dashboard/integrations, one row per
(organization, provider).

``provider`` is a free string (not an enum), same convention as
MessageTemplate.channel and StepDefinition.channel — new providers (a future
LinkedIn OAuth connect, Outlook, ...) need no migration, just a new row of
this same shape and a provider-specific OAuth service alongside
``app.services.integrations.gmail_oauth``.

Tokens are never stored in plaintext — see app.core.token_crypto. Losing the
encryption key makes existing rows undecryptable (the connection breaks and
must be reconnected); it does NOT leak the token, which is the trade-off
this project accepts everywhere secrets are involved (see CLAUDE.md).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlmodel import Field, UniqueConstraint

from app.models.base import TimestampMixin, new_uuid


class IntegrationConnection(TimestampMixin, table=True):
    """One connected third-party account for one organization."""

    __tablename__ = "integration_connections"
    __table_args__ = (UniqueConstraint("organization_id", "provider", name="uq_integration_org_provider"),)

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True, nullable=False)
    connected_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")

    # "gmail" today; free-form so future providers don't need a migration.
    provider: str = Field(index=True, nullable=False)

    # Shown in the UI so the team can tell whose inbox a sequence sends
    # from ("conectado como maria@empresa.com") without decrypting anything.
    external_account_email: str | None = Field(default=None)

    access_token_encrypted: str = Field(nullable=False)
    refresh_token_encrypted: str | None = Field(default=None)
    token_expires_at: datetime | None = Field(default=None)
    # Space-separated, as returned by the provider — informational only.
    scopes: str | None = Field(default=None)

    # Set when a token refresh fails (revoked access, expired refresh token)
    # instead of silently dropping the row — the UI shows "reconectar" with
    # this message rather than the connection just vanishing unexplained.
    last_error: str | None = Field(default=None)
