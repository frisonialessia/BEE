"""OutboundWebhook — a user-configured destination for BEE's own events.

BEE already pushes to a handful of integration points via
``WorkflowOrchestrator``'s built-in handlers (``CRMUpdateHandler``,
``BillingHandler``, ...) — but those are wired to hardcoded, env-var-only
URLs (``WORKFLOW_CRM_URL`` and friends), a devops setting no org can touch
for itself. This is that missing piece: any org can register its own
webhook URL(s) — pointed at Zapier, Make, a Slack incoming-webhook, or their
own system — and pick which BEE events it wants to receive, all from the
dashboard, with no partner API credentials required on either side. See
``OutboundWebhookHandler`` (app.services.workflow_orchestrator.handlers)
for the dispatch side.
"""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class OutboundWebhook(TimestampMixin, table=True):
    """One org-configured subscription: a URL plus the event types it wants."""

    __tablename__ = "outbound_webhooks"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    created_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")

    url: str = Field(nullable=False, max_length=1000)
    # Plaintext, not hashed — unlike an OrganizationApiKey (only ever
    # *verified* against a caller-presented value, never read back), this
    # secret is used the other way around: BEE signs every outgoing payload
    # with it so the receiving system can verify authenticity, which means
    # BEE has to be able to read it back at dispatch time. Same storage
    # convention as ``WEBHOOK_SIGNING_SECRET`` in app.core.config.
    secret: str = Field(nullable=False, max_length=200)
    # Shown in listings instead of the full secret — same one-time-reveal
    # UX as OrganizationApiKey.key_prefix, computed once at creation.
    secret_preview: str = Field(default="", max_length=20)
    # e.g. ["opportunity.won", "opportunity.lost"] — a subset of what
    # WorkflowOrchestrator actually publishes; see
    # app.services.workflow_orchestrator.handlers for the full catalog.
    event_types: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    is_active: bool = Field(default=True)

    # Lightweight observability — enough to show "this is or isn't working"
    # in the settings UI without a separate delivery-log table.
    last_triggered_at: datetime | None = Field(default=None)
    last_status: str | None = Field(default=None, max_length=16)  # "success" | "failed"
    failure_count: int = Field(default=0)
