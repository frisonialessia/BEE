"""Schemas for the daily digest — ``/organizations/digest`` and the cron tick."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class OrganizationDigestIn(BaseModel):
    """Partial patch, same ``exclude_unset`` convention as the profile and
    SSO settings. ``webhook_url=""`` clears the URL."""

    webhook_url: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None
    hour_utc: int | None = Field(default=None, ge=0, le=23)

    @field_validator("webhook_url")
    @classmethod
    def _https_only(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if value == "":
            return ""
        if not value.startswith("https://"):
            raise ValueError("The webhook URL must start with https://")
        return value


class OrganizationDigestOut(BaseModel):
    enabled: bool
    hour_utc: int
    webhook_configured: bool
    # Last few characters only — enough to recognize which webhook is
    # set, never enough to post with it.
    webhook_url_hint: str | None
    last_sent_at: datetime | None


DigestSkipReason = Literal["not_configured", "disabled", "already_sent_today", "not_the_hour", "delivery_failed"]


class DigestSendOut(BaseModel):
    sent: bool
    reason: DigestSkipReason | None
    cards: int


class DigestTickOut(BaseModel):
    organizations_checked: int
    sent: int
    skipped: int
    duration_ms: int
    errors: list[dict[str, Any]]
