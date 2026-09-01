"""Schemas for the account activity feed (GET /companies/{id}/activity)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.account_activity import AccountActivityEventType


class AccountActivityEventOut(BaseModel):
    """One entry in a company's activity feed.

    Carries ``user_full_name``/``user_avatar_url`` denormalized from
    ``User`` at read time (not stored on the event itself) — the feed is
    "who did what, when", which is unreadable as a bare user id, and a
    display name changing later should show the *current* name, not a
    stale snapshot frozen at event time.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    user_id: uuid.UUID
    user_full_name: str
    user_avatar_url: str | None
    event_type: AccountActivityEventType
    created_at: datetime
