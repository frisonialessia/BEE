"""OrganizationApiKey — per-tenant credential for signal ingestion.

``POST /signals/webhook`` is BEE's primary ingestion path for external
integrations (CRMs, intent-data vendors, a customer's own scripts). Those
callers never log in as a dashboard user, so they carry no JWT — but the
records they create still need to land in the right tenant. An
OrganizationApiKey is how a webhook caller identifies "which organization
am I pushing data for", separate from ``WEBHOOK_SIGNING_SECRET`` (which only
proves "this sender is trusted", not "for whom").

Only the SHA-256 hash of the key is stored (see
``app.core.security.generate_api_key``) — the plaintext is returned to the
caller exactly once, at creation time, and is unrecoverable afterward.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class OrganizationApiKey(TimestampMixin, table=True):
    """A revocable, named credential scoped to one organization."""

    __tablename__ = "organization_api_keys"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True, nullable=False)
    created_by_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="users.id", description="Who generated this key, for audit purposes."
    )

    name: str = Field(nullable=False, description="Caller-chosen label, e.g. 'Zapier integration'.")
    # First few characters of the plaintext key, kept only for display in a key
    # listing ('bee_org_AbCd1234…') so an admin can recognize which key is
    # which without the full secret ever being stored or shown again.
    key_prefix: str = Field(nullable=False)
    key_hash: str = Field(unique=True, index=True, nullable=False)

    is_active: bool = Field(default=True, index=True)
    last_used_at: datetime | None = Field(default=None)
