"""Lead repository."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlmodel import or_, select

from app.models.lead import Lead
from app.models.meeting import Meeting
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.repositories.base import BaseRepository
from app.schemas.signal import LeadRef
from app.services.permissions import scope_by_organization_id


class LeadRepository(BaseRepository[Lead]):
    """Data-access operations for :class:`Lead`."""

    model = Lead

    def get_by_email(self, email: str, organization_id: uuid.UUID | None = None) -> Lead | None:
        """Look up a lead by email, scoped to ``organization_id`` when given.

        Without organization scoping, two different organizations' leads
        that happen to share an email address (a common contact, or just
        coincidence) would silently merge into one Lead row — a real
        cross-tenant leak once ingestion starts tagging organization_id. Same
        "untagged = shared" convention as ``CompanyRepository`` when no
        organization context is available.
        """
        statement = select(Lead).where(Lead.email == email)
        if organization_id is not None:
            statement = statement.where(
                or_(Lead.organization_id == organization_id, Lead.organization_id.is_(None))
            )
        else:
            statement = statement.where(Lead.organization_id.is_(None))
        return self.session.exec(statement).first()

    def get_or_create_from_ref(
        self,
        ref: LeadRef | None,
        company_id: uuid.UUID | None,
        organization_id: uuid.UUID | None = None,
    ) -> Lead | None:
        """Resolve a :class:`LeadRef` from a webhook to a persisted lead.

        Uses ``email`` as the dedup key. Returns ``None`` when the reference has
        no name, keeping ingestion resilient to company-only signals.
        """
        if ref is None or (not ref.email and not ref.full_name):
            return None

        if ref.email:
            existing = self.get_by_email(ref.email, organization_id)
            if existing is not None:
                return existing

        lead = Lead(
            organization_id=organization_id,
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
        organization_id: uuid.UUID | None = None,
    ) -> list[Lead]:
        """Same paging as :meth:`BaseRepository.list`, with the same optional
        visibility filter used by ``OpportunityRepository`` — see
        ``app.services.permissions`` for how the filter set is computed.

        ``organization_id`` applies the tenant boundary itself — see
        ``OpportunityRepository.list_ready_to_action``'s docstring for why
        this is needed in addition to the assignment filter above (an
        OWNER/ADMIN's ``visible_user_ids`` is ``None``, so without this every
        organization's leads would be visible, not just their own).
        """
        statement = select(Lead).order_by(Lead.created_at.desc())  # type: ignore[union-attr]
        if visible_user_ids is not None:
            statement = statement.where(Lead.assigned_to_user_id.in_(visible_user_ids))
        statement = scope_by_organization_id(statement, Lead.organization_id, organization_id)
        statement = statement.limit(limit).offset(offset)
        return list(self.session.exec(statement).all())

    def find_duplicate_groups(self, organization_id: uuid.UUID | None = None) -> list[tuple[str, list[Lead]]]:
        """Group leads that share a normalized email — the same dedup key
        ``get_or_create_from_ref`` uses going forward, but manual entry and
        CSV bulk import (neither checks ``get_by_email`` first) can still
        create a true duplicate, and casing differences slip past an exact
        match too ("Jane@Acme.com" vs "jane@acme.com")."""
        statement = select(Lead).where(Lead.email.is_not(None))
        statement = scope_by_organization_id(statement, Lead.organization_id, organization_id)
        leads = list(self.session.exec(statement).all())

        by_email: dict[str, list[Lead]] = defaultdict(list)
        for lead in leads:
            by_email[lead.email.strip().lower()].append(lead)

        return [(key, items) for key, items in by_email.items() if len(items) > 1]

    def merge(self, keep_id: uuid.UUID, merge_id: uuid.UUID) -> Lead:
        """Fold ``merge_id`` into ``keep_id``: repoint every signal,
        opportunity, and meeting, then delete the now-empty duplicate.
        Caller commits.

        Meeting.lead_id used to be left pointing at the deleted row —
        harmless on SQLite (no FK enforcement in the test DB, so the row
        just went silently orphaned, invisible to every query that joins
        through lead_id) but a real FK-violation risk on Postgres. Repoint
        it the same way Opportunity/Signal already were."""
        keep = self.get(keep_id)
        merge_target = self.get(merge_id)
        if keep is None or merge_target is None:
            raise ValueError("Both leads must exist to merge.")
        if keep_id == merge_id:
            raise ValueError("Cannot merge a lead into itself.")

        for opp in self.session.exec(select(Opportunity).where(Opportunity.lead_id == merge_id)).all():
            opp.lead_id = keep_id
            self.session.add(opp)
        for sig in self.session.exec(select(Signal).where(Signal.lead_id == merge_id)).all():
            sig.lead_id = keep_id
            self.session.add(sig)
        for meeting in self.session.exec(select(Meeting).where(Meeting.lead_id == merge_id)).all():
            meeting.lead_id = keep_id
            self.session.add(meeting)

        self.session.delete(merge_target)
        self.session.flush()
        self.session.refresh(keep)
        return keep
