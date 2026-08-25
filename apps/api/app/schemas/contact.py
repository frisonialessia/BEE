"""Pydantic schemas for the public Contact page submission endpoint."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ContactSubmissionIn(BaseModel):
    """What the public Contact page (apps/web's /contacto) actually sends.

    No organization_id, no auth token — the person submitting this isn't
    a BEE customer yet. ``honeypot`` is a hidden field real visitors never
    see or fill; a bot that fills every input on the form fills it too,
    which is how the endpoint tells them apart without a CAPTCHA.
    """

    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    company_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    message: str = Field(min_length=1, max_length=4000)
    source: str | None = Field(default=None, max_length=100)
    honeypot: str | None = Field(default=None, max_length=255)


class ContactSubmissionOut(BaseModel):
    """Confirms what was actually persisted — the page shows a success
    state only after this comes back, never optimistically before the
    write is confirmed."""

    id: uuid.UUID
    created_at: datetime
