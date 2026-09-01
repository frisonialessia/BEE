"""Company repository."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlmodel import or_, select

from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.repositories.base import BaseRepository
from app.schemas.signal import CompanyRef
from app.services.permissions import scope_by_organization_id


class CompanyRepository(BaseRepository[Company]):
    """Data-access operations for :class:`Company`."""

    model = Company

    def list_scoped(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        visible_user_ids: set[uuid.UUID] | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> list[Company]:
        """Same paging/visibility contract as ``LeadRepository.list_scoped``,
        now that companies carry ``owner_user_id`` too. ``organization_id``
        still applies the tenant boundary itself — see
        ``OpportunityRepository.list_ready_to_action``'s docstring for why
        that's needed in addition to the assignment filter (an OWNER/ADMIN's
        ``visible_user_ids`` is ``None``, so without it every organization's
        companies would be visible, not just their own).
        """
        statement = select(Company).order_by(Company.created_at.desc())  # type: ignore[union-attr]
        if visible_user_ids is not None:
            statement = statement.where(Company.owner_user_id.in_(visible_user_ids))
        statement = scope_by_organization_id(statement, Company.organization_id, organization_id)
        statement = statement.limit(limit).offset(offset)
        return list(self.session.exec(statement).all())

    def get_by_domain(self, domain: str, organization_id: uuid.UUID | None = None) -> Company | None:
        """Look up a company by domain, scoped to ``organization_id`` when given.

        Domain is only unique *per organization* (see ``uq_companies_org_domain``
        in ``app.models.company``) — a caller with no organization context
        (unauthenticated/legacy) still matches only untagged rows, the same
        "untagged = shared" convention used everywhere else, rather than
        matching across every tenant.
        """
        statement = select(Company).where(Company.domain == domain)
        if organization_id is not None:
            statement = statement.where(
                or_(Company.organization_id == organization_id, Company.organization_id.is_(None))
            )
        else:
            statement = statement.where(Company.organization_id.is_(None))
        return self.session.exec(statement).first()

    def get_by_name(self, name: str, organization_id: uuid.UUID | None = None) -> Company | None:
        """Look up a company by exact name (fallback when no domain is known).

        Same organization scoping as :meth:`get_by_domain`.
        """
        statement = select(Company).where(Company.name == name)
        if organization_id is not None:
            statement = statement.where(
                or_(Company.organization_id == organization_id, Company.organization_id.is_(None))
            )
        else:
            statement = statement.where(Company.organization_id.is_(None))
        return self.session.exec(statement).first()

    def get_or_create_from_ref(
        self, ref: CompanyRef | None, organization_id: uuid.UUID | None = None
    ) -> Company | None:
        """Resolve a :class:`CompanyRef` from a webhook to a persisted company.

        Resolution prefers ``domain`` (the stable natural key) and falls back to
        ``name``. Returns ``None`` when the reference carries no identifying
        information, so ingestion is never blocked by missing company data.
        ``organization_id`` (resolved from the caller's API key — see
        ``app.api.deps.get_organization_from_api_key``) is stamped on a newly
        created company and used to scope the dedup lookup, so two
        organizations tracking the same domain each get their own row.
        """
        if ref is None or (not ref.domain and not ref.name):
            return None

        existing: Company | None = None
        if ref.domain:
            existing = self.get_by_domain(ref.domain, organization_id)
        if existing is None and ref.name:
            existing = self.get_by_name(ref.name, organization_id)
        if existing is not None:
            return existing

        company = Company(
            organization_id=organization_id,
            name=ref.name or (ref.domain or "Unknown"),
            domain=ref.domain,
            industry=ref.industry,
            country=ref.country,
        )
        return self.add(company)

    def find_duplicate_groups(self, organization_id: uuid.UUID | None = None) -> list[tuple[str, list[Company]]]:
        """Group companies that are very likely the same real-world account.

        The unique constraint on (organization_id, domain) blocks *exact*
        duplicate domains going forward, but doesn't catch: different casing
        ("Acme.com" vs "acme.com" — Postgres text comparison is
        case-sensitive), a stray "www." prefix, companies entered without a
        domain at all (manual entry, CSV import — neither dedupes today), or
        rows created before the constraint existed. Two keys, in priority
        order: normalized domain first, then exact name for the domain-less
        remainder — a company only ever appears in one group.
        """
        statement = select(Company)
        statement = scope_by_organization_id(statement, Company.organization_id, organization_id)
        companies = list(self.session.exec(statement).all())

        by_domain: dict[str, list[Company]] = defaultdict(list)
        no_domain: list[Company] = []
        for c in companies:
            if c.domain:
                key = c.domain.strip().lower().removeprefix("www.")
                by_domain[key].append(c)
            else:
                no_domain.append(c)

        by_name: dict[str, list[Company]] = defaultdict(list)
        for c in no_domain:
            by_name[c.name.strip().lower()].append(c)

        groups: list[tuple[str, list[Company]]] = [
            (key, items) for key, items in by_domain.items() if len(items) > 1
        ]
        groups += [(key, items) for key, items in by_name.items() if len(items) > 1]
        return groups

    def merge(self, keep_id: uuid.UUID, merge_id: uuid.UUID) -> Company:
        """Fold ``merge_id`` into ``keep_id``: repoint every lead, signal, and
        opportunity, then delete the now-empty duplicate. Caller commits."""
        keep = self.get(keep_id)
        merge_target = self.get(merge_id)
        if keep is None or merge_target is None:
            raise ValueError("Both companies must exist to merge.")
        if keep_id == merge_id:
            raise ValueError("Cannot merge a company into itself.")

        for lead in self.session.exec(select(Lead).where(Lead.company_id == merge_id)).all():
            lead.company_id = keep_id
            self.session.add(lead)
        for opp in self.session.exec(select(Opportunity).where(Opportunity.company_id == merge_id)).all():
            opp.company_id = keep_id
            self.session.add(opp)
        for sig in self.session.exec(select(Signal).where(Signal.company_id == merge_id)).all():
            sig.company_id = keep_id
            self.session.add(sig)

        self.session.delete(merge_target)
        self.session.flush()
        self.session.refresh(keep)
        return keep
