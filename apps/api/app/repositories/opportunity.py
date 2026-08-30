"""Opportunity repository."""

from __future__ import annotations

import uuid

from sqlmodel import select

from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.repositories.base import BaseRepository
from app.services.permissions import scope_by_organization_id


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

    def list_ready_to_action(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        visible_user_ids: set[uuid.UUID] | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> list[Opportunity]:
        """Return opportunities that have a complete battlecard, ranked by score.

        ``visible_user_ids``, when given, restricts results to opportunities
        assigned to one of those users — see ``app.services.permissions`` for
        how a caller's manager/member visibility scope is computed. ``None``
        (the default) applies no restriction, preserving existing behavior for
        callers that don't have an authenticated user in context.

        ``organization_id`` applies the tenant boundary itself — the
        assignment filter above narrows *within* an org (who on the team can
        see it), but without this an OWNER/ADMIN (whose ``visible_user_ids``
        is ``None``, meaning "no per-user restriction") would see every
        organization's opportunities, not just their own.
        """
        from app.models.base import OpportunityStatus

        statement = (
            select(Opportunity)
            .where(Opportunity.status == OpportunityStatus.READY_TO_ACTION)
            .order_by(Opportunity.score.desc())  # type: ignore[union-attr]
        )
        if visible_user_ids is not None:
            statement = statement.where(Opportunity.assigned_to_user_id.in_(visible_user_ids))
        statement = scope_by_organization_id(statement, Opportunity.organization_id, organization_id)
        statement = statement.limit(limit).offset(offset)
        return list(self.session.exec(statement).all())

    def list_scoped(
        self,
        *,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
        visible_user_ids: set[uuid.UUID] | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> list[Opportunity]:
        """Same paging/ordering as :meth:`BaseRepository.list`, with the same
        optional visibility filter as :meth:`list_ready_to_action` — including
        the ``organization_id`` tenant boundary, see its docstring there.

        ``status=None`` (the default) returns every status — this is what
        every real-account view (CRM board, Forecast, Ganado/Perdido,
        Priorización, the Resumen embudo…) actually needs, since none of
        them ask for a single stage. Pass an explicit status to filter to
        just that one instead.
        """
        from app.models.base import OpportunityStatus

        statement = select(Opportunity).order_by(Opportunity.created_at.desc())  # type: ignore[union-attr]
        if status is not None:
            statement = statement.where(Opportunity.status == OpportunityStatus(status))
        if visible_user_ids is not None:
            statement = statement.where(Opportunity.assigned_to_user_id.in_(visible_user_ids))
        statement = scope_by_organization_id(statement, Opportunity.organization_id, organization_id)
        statement = statement.limit(limit).offset(offset)
        return list(self.session.exec(statement).all())
