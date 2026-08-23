"""Company repository."""

from __future__ import annotations

import uuid

from sqlmodel import or_, select

from app.models.company import Company
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
        organization_id: uuid.UUID | None = None,
    ) -> list[Company]:
        """Same tenant-scoping convention as ``LeadRepository.list_scoped`` —
        companies have no per-user assignment, so this only applies the
        organization boundary, not a visibility filter.
        """
        statement = select(Company).order_by(Company.created_at.desc())  # type: ignore[union-attr]
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
