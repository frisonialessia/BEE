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

    def list_scoped(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        visible_user_ids: set[uuid.UUID] | None = None,
    ) -> list[Lead]:
        """Same paging as :meth:`BaseRepository.list`, with the same optional
        visibility filter used by ``OpportunityRepository`` — see
        ``app.services.permissions`` for how the filter set is computed.
        """
        statement = select(Lead).order_by(Lead.created_at.desc())  # type: ignore[union-attr]
        if visible_user_ids is not None:
            statement = statement.where(Lead.assigned_to_user_id.in_(visible_user_ids))
        statement = statement.limit(limit).offset(offset)
        return list(self.session.exec(statement).all())
