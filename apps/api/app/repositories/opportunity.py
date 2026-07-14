"""Opportunity repository."""

from __future__ import annotations

import uuid

from sqlmodel import select

from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.repositories.base import BaseRepository


class OpportunityRepository(BaseRepository[Opportunity]):
    """Data-access operations for :class:`Opportunity`."""

    model = Opportunity

    def get_with_relations(
        self, opportunity_id: uuid.UUID
    ) -> tuple[Opportunity, Signal | None, Company | None, Lead | None] | None:
        """Fetch an opportunity with its related signal, company, and lead.

        Returns a tuple ``(opportunity, signal, company, lead)`` so the battlecard
        endpoint can assemble the full response in a single query round-trip.
        Returns ``None`` when the opportunity does not exist.
        """
        opportunity = self.session.get(Opportunity, opportunity_id)
        if opportunity is None:
            return None

        signal: Signal | None = None
        if opportunity.signal_id:
            signal = self.session.get(Signal, opportunity.signal_id)

        company: Company | None = None
        if opportunity.company_id:
            company = self.session.get(Company, opportunity.company_id)

        lead: Lead | None = None
        if opportunity.lead_id:
            lead = self.session.get(Lead, opportunity.lead_id)

        return opportunity, signal, company, lead

    def list_ready_to_action(self, *, limit: int = 50, offset: int = 0) -> list[Opportunity]:
        """Return opportunities that have a complete battlecard, ranked by score."""
        from app.models.base import OpportunityStatus

        statement = (
            select(Opportunity)
            .where(Opportunity.status == OpportunityStatus.READY_TO_ACTION)
            .order_by(Opportunity.score.desc())  # type: ignore[union-attr]
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.exec(statement).all())
