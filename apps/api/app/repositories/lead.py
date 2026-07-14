"""Lead repository."""

from __future__ import annotations

import uuid

from sqlmodel import select

from app.models.lead import Lead
from app.repositories.base import BaseRepository
from app.schemas.signal import LeadRef


class LeadRepository(BaseRepository[Lead]):
    """Data-access operations for :class:`Lead`."""

    model = Lead

    def get_by_email(self, email: str) -> Lead | None:
        """Look up a lead by email (the most reliable person-level key)."""
        statement = select(Lead).where(Lead.email == email)
        return self.session.exec(statement).first()

    def get_or_create_from_ref(
        self, ref: LeadRef | None, company_id: uuid.UUID | None
    ) -> Lead | None:
        """Resolve a :class:`LeadRef` from a webhook to a persisted lead.

        Uses ``email`` as the dedup key. Returns ``None`` when the reference has
        no name, keeping ingestion resilient to company-only signals.
        """
        if ref is None or (not ref.email and not ref.full_name):
            return None

        if ref.email:
            existing = self.get_by_email(ref.email)
            if existing is not None:
                return existing

        lead = Lead(
            company_id=company_id,
            full_name=ref.full_name or (ref.email or "Unknown"),
            email=ref.email,
            title=ref.title,
            seniority=ref.seniority,
            linkedin_url=ref.linkedin_url,
        )
        return self.add(lead)
