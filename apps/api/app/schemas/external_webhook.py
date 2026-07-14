"""Schemas for the External Ingestion webhook API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ExternalProvider = Literal["linkedin", "g2", "google_search", "capterra", "unknown"]


class ExternalWebhookIn(BaseModel):
    """Canonical envelope for inbound external provider webhooks.

    External systems (LinkedIn Sales Nav, G2, Google Alerts) POST events here.
    The handler validates the provider HMAC signature, enqueues async processing,
    and returns immediately so the UI is never blocked.
    """

    model_config = {"extra": "allow"}

    # Provider identifier — determines which webhook secret validates the signature
    provider: ExternalProvider = Field(default="unknown")
    # Event type from the provider (e.g. funding.round.announced, g2_comparison)
    event_type: str = Field(..., examples=["linkedin.profile.view", "g2_comparison"])
    # Alias for event_type (some providers use "event")
    event: str | None = None

    title: str | None = None
    description: str | None = None
    external_id: str | None = None

    company_domain: str | None = None
    company: dict[str, Any] | None = None
    lead: dict[str, Any] | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class ExternalWebhookAccepted(BaseModel):
    """202 Accepted response — task queued for background processing."""

    task_id: str
    status: str = "queued"
    provider: str
    message: str = "Webhook accepted — processing asynchronously"


class IngestionWorkerStatus(BaseModel):
    """Status of the background ingestion worker."""

    running: bool
    queue_depth: int
    processed_count: int
    error_count: int
    providers: list[dict[str, Any]] = Field(default_factory=list)
    rate_limits: dict[str, dict[str, int | float]] = Field(default_factory=dict)
