"""ExternalAPIOrchestrator — central hub for all outbound external API calls.

Every call to LinkedIn, G2, Google Search, or Capterra flows through this
orchestrator, which enforces:

1. **Rate limiting** — global per-provider token buckets
2. **Credential access** — via SecretManager (never hard-coded)
3. **Uniform error handling** — providers never raise; they return result objects
4. **Mock safety** — unconfigured providers return deterministic mock data

Typical flow (async worker)
---------------------------
::

    Signal detected (webhook)
        → IngestionWorker.enqueue(EnrichmentTask)
        → ExternalAPIOrchestrator.enrich_lead_from_signal(task)
        → LinkedInProvider.fetch_lead_profile(...)
        → Update signal.raw_payload["external_enrichment"]
        → StrategyGeneratorService.enrich(signal, opportunity)
        → EnrichmentContext now includes external_profile data
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session

from app.core.logging import get_logger
from app.services.external_api.interface import (
    ExternalProfileResult,
    ExternalSearchResult,
    IExternalProvider,
    ProviderName,
)
from app.services.external_api.providers.g2 import G2Provider
from app.services.external_api.providers.google_search import GoogleSearchProvider
from app.services.external_api.providers.linkedin import LinkedInProvider
from app.services.external_api.rate_limiter import get_rate_limiter

logger = get_logger(__name__)


class ExternalAPIOrchestrator:
    """Routes outbound external API calls with rate limiting and provider registry."""

    def __init__(self, session: Session | None = None) -> None:
        self.session = session
        self._rate_limiter = get_rate_limiter()
        self._providers: dict[ProviderName, IExternalProvider] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        for provider in (LinkedInProvider(), G2Provider(), GoogleSearchProvider()):
            self.register_provider(provider)

    def register_provider(self, provider: IExternalProvider) -> None:
        self._providers[provider.name] = provider
        logger.debug("ExternalAPIOrchestrator: registered provider %s", provider.name)

    def get_provider(self, name: ProviderName) -> IExternalProvider | None:
        return self._providers.get(name)

    def list_providers(self) -> list[dict[str, Any]]:
        return [
            {
                "name": p.name,
                "configured": p.is_configured(),
                "rate_limit_per_hour": p.rate_limit.requests_per_hour,
            }
            for p in self._providers.values()
        ]

    def _acquire_rate_limit(self, provider: ProviderName) -> bool:
        return self._rate_limiter.acquire(provider)

    def fetch_linkedin_profile(
        self,
        *,
        linkedin_url: str | None = None,
        email: str | None = None,
        full_name: str | None = None,
        company_domain: str | None = None,
    ) -> ExternalProfileResult:
        """Fetch lead profile from LinkedIn (rate-limited)."""
        if not self._acquire_rate_limit("linkedin"):
            return ExternalProfileResult(
                provider="linkedin",
                success=False,
                error="LinkedIn rate limit exceeded — retry later",
            )
        provider = self._providers.get("linkedin")
        if not provider:
            return ExternalProfileResult(provider="linkedin", success=False, error="LinkedIn provider not registered")
        return provider.fetch_lead_profile(
            linkedin_url=linkedin_url,
            email=email,
            full_name=full_name,
            company_domain=company_domain,
        )

    def search_g2_intent(
        self,
        *,
        company_domain: str,
        company_name: str | None = None,
        keywords: list[str] | None = None,
    ) -> ExternalSearchResult:
        if not self._acquire_rate_limit("g2"):
            return ExternalSearchResult(
                provider="g2",
                success=False,
                query=company_domain,
                error="G2 rate limit exceeded",
            )
        provider = self._providers.get("g2")
        if not provider:
            return ExternalSearchResult(provider="g2", success=False, query=company_domain, error="G2 not registered")
        return provider.search_intent(
            company_domain=company_domain,
            company_name=company_name,
            keywords=keywords,
        )

    def search_google_intent(
        self,
        *,
        company_domain: str,
        company_name: str | None = None,
        keywords: list[str] | None = None,
    ) -> ExternalSearchResult:
        if not self._acquire_rate_limit("google_search"):
            return ExternalSearchResult(
                provider="google_search",
                success=False,
                query=company_domain,
                error="Google Search rate limit exceeded",
            )
        provider = self._providers.get("google_search")
        if not provider:
            return ExternalSearchResult(
                provider="google_search",
                success=False,
                query=company_domain,
                error="Google Search not registered",
            )
        return provider.search_intent(
            company_domain=company_domain,
            company_name=company_name,
            keywords=keywords,
        )

    def scan_market_news(
        self, *, company_domain: str, company_name: str | None = None
    ) -> ExternalSearchResult:
        """Market-moving news for MarketScanOrchestrator (see
        app.services.market_scan) — same rate-limit-then-delegate shape as
        search_google_intent above, routed to search_market_news instead of
        search_intent. Only google_search implements this today; a provider
        that doesn't returns the base class's "not implemented" result,
        same graceful-skip behavior as any unconfigured provider.
        """
        if not self._acquire_rate_limit("google_search"):
            return ExternalSearchResult(
                provider="google_search",
                success=False,
                query=company_domain,
                error="Google Search rate limit exceeded",
            )
        provider = self._providers.get("google_search")
        if not provider:
            return ExternalSearchResult(
                provider="google_search",
                success=False,
                query=company_domain,
                error="Google Search not registered",
            )
        return provider.search_market_news(company_domain=company_domain, company_name=company_name)

    def enrich_lead_from_signal(self, signal_payload: dict[str, Any]) -> dict[str, Any]:
        """Run full external enrichment for an inbound signal payload.

        Returns a dict suitable for merging into ``signal.raw_payload["external_enrichment"]``.
        """
        company = signal_payload.get("company") or {}
        lead = signal_payload.get("lead") or {}
        domain = company.get("domain")
        enrichment: dict[str, Any] = {"providers_called": []}

        # 1. LinkedIn profile (primary enrichment path)
        linkedin_result = self.fetch_linkedin_profile(
            linkedin_url=lead.get("linkedin_url"),
            email=lead.get("email"),
            full_name=lead.get("full_name"),
            company_domain=domain,
        )
        enrichment["providers_called"].append("linkedin")
        enrichment["linkedin"] = _profile_to_dict(linkedin_result)

        # Merge LinkedIn fields back into lead ref when missing
        if linkedin_result.success:
            if not lead.get("full_name") and linkedin_result.lead_name:
                lead["full_name"] = linkedin_result.lead_name
            if not lead.get("title") and linkedin_result.lead_title:
                lead["title"] = linkedin_result.lead_title
            if not lead.get("seniority") and linkedin_result.lead_seniority:
                lead["seniority"] = linkedin_result.lead_seniority
            if not company.get("name") and linkedin_result.company_name:
                company["name"] = linkedin_result.company_name

        # 2. G2 intent (when domain available)
        if domain:
            g2_result = self.search_g2_intent(
                company_domain=domain,
                company_name=company.get("name"),
            )
            enrichment["providers_called"].append("g2")
            enrichment["g2"] = _search_to_dict(g2_result)

        # 3. Google research signals
        if domain:
            google_result = self.search_google_intent(
                company_domain=domain,
                company_name=company.get("name"),
            )
            enrichment["providers_called"].append("google_search")
            enrichment["google_search"] = _search_to_dict(google_result)

        enrichment["lead"] = lead
        enrichment["company"] = company
        return enrichment

    def rate_limit_status(self) -> dict[str, dict[str, int | float]]:
        return self._rate_limiter.status()


def _profile_to_dict(result: ExternalProfileResult) -> dict[str, Any]:
    return {
        "success": result.success,
        "mock": result.mock,
        "lead_name": result.lead_name,
        "lead_title": result.lead_title,
        "lead_seniority": result.lead_seniority,
        "company_name": result.company_name,
        "company_domain": result.company_domain,
        "linkedin_url": result.linkedin_url,
        "headline": result.headline,
        "location": result.location,
        "error": result.error,
    }


def _search_to_dict(result: ExternalSearchResult) -> dict[str, Any]:
    return {
        "success": result.success,
        "mock": result.mock,
        "query": result.query,
        "intent_keywords": result.intent_keywords,
        "item_count": len(result.items),
        "error": result.error,
    }
