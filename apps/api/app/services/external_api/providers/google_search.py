"""Google Custom Search provider — company research and intent signals."""

from __future__ import annotations

import httpx

from app.core.logging import get_logger
from app.services.external_api.interface import (
    ExternalProfileResult,
    ExternalSearchResult,
    IExternalProvider,
    RateLimitConfig,
)
from app.services.secret_manager import get_secret_manager

logger = get_logger(__name__)

_GOOGLE_SEARCH_API = "https://www.googleapis.com/customsearch/v1"


class GoogleSearchProvider(IExternalProvider):
    """Search Google for company research signals."""

    name = "google_search"  # type: ignore[assignment]
    rate_limit = RateLimitConfig(requests_per_hour=100, min_interval_seconds=1.0)

    def is_configured(self) -> bool:
        creds = get_secret_manager().get("google_search")
        return bool(creds.api_key and creds.extra and creds.extra.get("cx"))

    def fetch_lead_profile(self, **kwargs) -> ExternalProfileResult:
        domain = kwargs.get("company_domain")
        name = kwargs.get("full_name")
        if not domain:
            return ExternalProfileResult(
                provider="google_search",
                success=False,
                error="company_domain required for Google search enrichment",
            )
        search = self.search_intent(company_domain=domain, company_name=name)
        if search.success and search.items:
            snippet = search.items[0].get("snippet", "")
            return ExternalProfileResult(
                provider="google_search",
                success=True,
                lead_name=name,
                company_domain=domain,
                headline=snippet[:200] if snippet else None,
                raw=search.items[0],
                mock=search.mock,
            )
        return ExternalProfileResult(
            provider="google_search",
            success=False,
            company_domain=domain,
            error=search.error or "No results",
        )

    def search_intent(
        self,
        *,
        company_domain: str,
        company_name: str | None = None,
        keywords: list[str] | None = None,
    ) -> ExternalSearchResult:
        if not self.is_configured():
            return self._mock_search(company_domain, company_name, keywords)

        creds = get_secret_manager().get("google_search")
        api_key = creds.api_key
        cx = (creds.extra or {}).get("cx")
        query = f"{company_name or company_domain} sales software buying"

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    _GOOGLE_SEARCH_API,
                    params={"key": api_key, "cx": cx, "q": query, "num": 5},
                )
                resp.raise_for_status()
                data = resp.json()

            items = [
                {
                    "title": item.get("title"),
                    "link": item.get("link"),
                    "snippet": item.get("snippet"),
                }
                for item in data.get("items", [])
            ]
            intent_kw = list(keywords or [])
            for item in items:
                intent_kw.extend(item.get("title", "").split()[:3])

            return ExternalSearchResult(
                provider="google_search",
                success=True,
                query=query,
                items=items,
                intent_keywords=list(dict.fromkeys(k.lower() for k in intent_kw if k))[:10],
                raw=data,
                mock=False,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("GoogleSearchProvider API call failed: %s", exc)
            return ExternalSearchResult(
                provider="google_search",
                success=False,
                query=company_domain,
                error=str(exc),
            )

    def search_market_news(
        self, *, company_domain: str, company_name: str | None = None
    ) -> ExternalSearchResult:
        """Market-moving news for MarketScanOrchestrator — funding,
        acquisitions, leadership changes, expansion — as opposed to
        search_intent's buying-intent-research query above. Same
        real/mock split as search_intent, deliberately not reusing that
        method: a shared "sales software buying" query would miss most of
        what this needs to find, and conflating the two makes neither
        query good.
        """
        if not self.is_configured():
            return self._mock_market_news(company_domain, company_name)

        creds = get_secret_manager().get("google_search")
        api_key = creds.api_key
        cx = (creds.extra or {}).get("cx")
        name = company_name or company_domain
        query = f'"{name}" (funding OR raises OR acquisition OR expansion OR partnership OR "new CEO" OR "new CFO")'

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    _GOOGLE_SEARCH_API,
                    # dateRestrict=d7: only the last 7 days — a scan tick runs
                    # every MARKET_SCAN_INTERVAL_HOURS anyway, so anything
                    # older was either already seen on a prior tick or isn't
                    # "just happened" news worth a signal.
                    params={"key": api_key, "cx": cx, "q": query, "num": 5, "dateRestrict": "d7"},
                )
                resp.raise_for_status()
                data = resp.json()

            items = [
                {
                    "title": item.get("title"),
                    "link": item.get("link"),
                    "snippet": item.get("snippet"),
                }
                for item in data.get("items", [])
            ]
            return ExternalSearchResult(
                provider="google_search",
                success=True,
                query=query,
                items=items,
                raw=data,
                mock=False,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("GoogleSearchProvider market-news search failed: %s", exc)
            return ExternalSearchResult(
                provider="google_search",
                success=False,
                query=company_domain,
                error=str(exc),
            )

    def _mock_market_news(
        self, company_domain: str, company_name: str | None
    ) -> ExternalSearchResult:
        # Deterministic — no items, not a fabricated headline. Unlike
        # _mock_search below (enrichment context, where a plausible example
        # is harmless filler), a fake funding/expansion headline here would
        # be indistinguishable from a real signal once it reaches a rep's
        # pipeline — see DEPLOY_CHECKLIST.md's "fabricated demo data"
        # hardening. Mock mode proves the pipeline wiring; it does not
        # invent news.
        name = company_name or company_domain
        logger.debug("GoogleSearchProvider: mock market-news search for %s (no real items)", name)
        return ExternalSearchResult(
            provider="google_search",
            success=True,
            query=f'"{name}" market news',
            items=[],
            raw={"mock": True},
            mock=True,
        )

    def _mock_search(
        self,
        company_domain: str,
        company_name: str | None,
        keywords: list[str] | None,
    ) -> ExternalSearchResult:
        name = company_name or company_domain.split(".")[0].title()
        logger.debug("GoogleSearchProvider: returning mock search for %s", company_domain)
        return ExternalSearchResult(
            provider="google_search",
            success=True,
            query=f"{name} sales intelligence",
            items=[{
                "title": f"{name} evaluating sales automation tools",
                "link": f"https://{company_domain}/blog/sales-stack",
                "snippet": f"{name} is researching CRM and sales intelligence platforms.",
            }],
            intent_keywords=(keywords or []) + ["sales automation", "crm evaluation"],
            raw={"mock": True},
            mock=True,
        )
