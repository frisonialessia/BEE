"""ContactSubmission — leads captured from the public marketing site's
Contact page (apps/web's /contacto).

Distinct from Lead (app.models.lead): a Lead lives inside an
organization's pipeline once someone is a BEE customer's prospect. A
ContactSubmission is a prospect for BEE ITSELF — someone who filled out
the public contact form before ever having an account or organization.
No organization_id here on purpose; there's no tenant yet to scope it to.
"""

from __future__ import annotations

import uuid

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class ContactSubmissionStatus:
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    DISMISSED = "dismissed"


class ContactSubmission(TimestampMixin, table=True):
    """A submission from the public Contact page. Persisted, never
    dropped — see app.api.v1.endpoints.contact for why that's a hard
    requirement rather than a nice-to-have (a real prospect's message
    silently vanishing is exactly the kind of thing this project has
    spent this whole session refusing to let happen to real data)."""

    __tablename__ = "contact_submissions"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    full_name: str = Field(nullable=False, max_length=255)
    email: str = Field(nullable=False, max_length=255, index=True)
    company_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    message: str = Field(nullable=False, max_length=4000)

    # Which CTA sent them here (e.g. "hero_primary", "header", "closing_cta")
    # — lets whoever triages these see which part of the page is actually
    # converting, without needing a separate analytics integration.
    source: str | None = Field(default=None, max_length=100)

    status: str = Field(default=ContactSubmissionStatus.NEW, index=True)

    # Coarse abuse signal only (rate limiting / spam triage) — not treated
    # as PII for any product feature, never shown in any user-facing view.
    ip_address: str | None = Field(default=None, max_length=64)
