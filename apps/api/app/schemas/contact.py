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

    # Optional for the same reason as `message` below: the landing's waitlist
    # form asks for an email and nothing else, because every extra field on a
    # one-line signup costs conversions. /contacto still requires a name in
    # its own UI.
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr
    company_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    # Optional since the landing's waitlist form posts here too (source=
    # "waitlist_*"): someone joining a waiting list has no message to write,
    # and inventing one to satisfy a NOT NULL would put UI copy in the
    # database. The /contacto form still requires it in its own UI.
    message: str | None = Field(default=None, max_length=4000)
    source: str | None = Field(default=None, max_length=100)
    honeypot: str | None = Field(default=None, max_length=255)


class ContactSubmissionOut(BaseModel):
    """Confirms what was actually persisted — the page shows a success
    state only after this comes back, never optimistically before the
    write is confirmed."""

    id: uuid.UUID
    created_at: datetime


class ContactSubmissionRow(BaseModel):
    """One row of the BEE-team-only inbox listing. Deliberately omits
    ``ip_address``: it exists for spam triage, not for reading."""

    id: uuid.UUID
    created_at: datetime
    full_name: str | None
    email: str
    company_name: str | None
    phone: str | None
    message: str | None
    source: str | None
    status: str


class ContactSubmissionListOut(BaseModel):
    total: int
    items: list[ContactSubmissionRow]
