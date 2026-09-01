"""External provider interface — the outbound integration contract.

Every third-party data source (LinkedIn Sales Nav, G2, Google Search) implements
:class:`IExternalProvider`. The :class:`ExternalAPIOrchestrator` routes calls
through the interface so providers can be swapped or mocked without touching
call sites.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

ProviderName = Literal["linkedin", "g2", "google_search", "capterra", "hiring", "website"]


@dataclass(frozen=True, slots=True)
class RateLimitConfig:
    """Per-provider rate limit configuration."""

    requests_per_hour: int
    min_interval_seconds: float


@dataclass(frozen=True, slots=True)
class ExternalProfileResult:
    """Normalised lead/company profile returned by any provider."""

    provider: ProviderName
    success: bool
    lead_name: str | None = None
    lead_title: str | None = None
    lead_seniority: str | None = None
    company_name: str | None = None
    company_domain: str | None = None
    company_industry: str | None = None
    company_size: str | None = None
    company_description: str | None = None
    linkedin_url: str | None = None
    headline: str | None = None
    location: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    mock: bool = False


@dataclass(frozen=True, slots=True)
class ExternalSearchResult:
    """Normalised search/intent result (G2 reviews, Google results)."""

    provider: ProviderName
    success: bool
    query: str
    items: list[dict[str, Any]] = field(default_factory=list)
    intent_keywords: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    mock: bool = False


class IExternalProvider(ABC):
    """Base class for all external data providers."""

    name: ProviderName
    rate_limit: RateLimitConfig

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True when real API credentials are available."""
        raise NotImplementedError

    @abstractmethod
    def fetch_lead_profile(
        self,
        *,
        linkedin_url: str | None = None,
        email: str | None = None,
        full_name: str | None = None,
        company_domain: str | None = None,
    ) -> ExternalProfileResult:
        """Fetch enriched lead profile data."""
        raise NotImplementedError

    def search_intent(
        self,
        *,
        company_domain: str,
        company_name: str | None = None,  # noqa: ARG002
        keywords: list[str] | None = None,  # noqa: ARG002
    ) -> ExternalSearchResult:
        """Optional: search for buying-intent signals (G2, Google)."""
        return ExternalSearchResult(
            provider=self.name,
            success=False,
            query=company_domain,
            error="search_intent not implemented for this provider",
        )

    def search_market_news(
        self,
        *,
        company_domain: str,
        company_name: str | None = None,  # noqa: ARG002
    ) -> ExternalSearchResult:
        """Optional: search for market-moving news about a company —
        funding, leadership changes, expansion, acquisitions — for
        MarketScanOrchestrator's proactive scan (see
        app.services.market_scan). Distinct from search_intent above:
        that's buying-intent research for a specific enrichment request,
        this is "what's newsworthy about this account right now" for the
        background scan. Same default-unimplemented fallback pattern.
        """
        return ExternalSearchResult(
            provider=self.name,
            success=False,
            query=company_domain,
            error="search_market_news not implemented for this provider",
        )

    def enrich_company(self, *, company_domain: str) -> ExternalProfileResult:
        """Optional: fill in a company's basic profile (name, description)
        from a single-domain lookup — for "create an account from just a
        domain" (see app.services.external_api.providers.website), not a
        lead-level or intent-level lookup. Same default-unimplemented
        fallback pattern as search_intent/search_market_news above.
        """
        return ExternalProfileResult(
            provider=self.name,
            success=False,
            company_domain=company_domain,
            error="enrich_company not implemented for this provider",
        )
