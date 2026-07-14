"""Company repository."""

from __future__ import annotations

from sqlmodel import select

from app.models.company import Company
from app.repositories.base import BaseRepository
from app.schemas.signal import CompanyRef


class CompanyRepository(BaseRepository[Company]):
    """Data-access operations for :class:`Company`."""

    model = Company

    def get_by_domain(self, domain: str) -> Company | None:
        """Look up a company by its (unique) domain."""
        statement = select(Company).where(Company.domain == domain)
        return self.session.exec(statement).first()

    def get_by_name(self, name: str) -> Company | None:
        """Look up a company by exact name (fallback when no domain is known)."""
        statement = select(Company).where(Company.name == name)
        return self.session.exec(statement).first()

    def get_or_create_from_ref(self, ref: CompanyRef | None) -> Company | None:
        """Resolve a :class:`CompanyRef` from a webhook to a persisted company.

        Resolution prefers ``domain`` (the stable natural key) and falls back to
        ``name``. Returns ``None`` when the reference carries no identifying
        information, so ingestion is never blocked by missing company data.
        """
        if ref is None or (not ref.domain and not ref.name):
            return None

        existing: Company | None = None
        if ref.domain:
            existing = self.get_by_domain(ref.domain)
        if existing is None and ref.name:
            existing = self.get_by_name(ref.name)
        if existing is not None:
            return existing

        company = Company(
            name=ref.name or (ref.domain or "Unknown"),
            domain=ref.domain,
            industry=ref.industry,
            country=ref.country,
        )
        return self.add(company)
