"""G2 provider — review and intent signals from G2.com."""

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

_G2_API = "https://data.g2.com/api/v1"


class G2Provider(IExternalProvider):
    """Fetch G2 review/intent data for a company."""

    name = "g2"  # type: ignore[assignment]
    rate_limit = RateLimitConfig(requests_per_hour=60, min_interval_seconds=2.0)

    def is_configured(self) -> bool:
        return get_secret_manager().is_configured("g2")

    def fetch_lead_profile(self, **kwargs) -> ExternalProfileResult:
        domain = kwargs.get("company_domain")
        if domain:
            search = self.search_intent(company_domain=domain)
            if search.success and search.items:
                item = search.items[0]
                return ExternalProfileResult(
                    provider="g2",
                    success=True,
                    company_name=item.get("company_name"),
                    company_domain=domain,
                    company_industry=item.get("category"),
                    raw=item,
                    mock=search.mock,
                )
        return ExternalProfileResult(
            provider="g2",
            success=False,
            error="G2 does not support direct lead profile lookup",
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

        api_key = get_secret_manager().get("g2").api_key
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(
                    f"{_G2_API}/products",
                    headers={"Authorization": f"Token {api_key}"},
                    params={"q": company_name or company_domain},
                )
                resp.raise_for_status()
                data = resp.json()
            items = data.get("data", []) if isinstance(data, dict) else []
            intent_kw = keywords or []
            for item in items[:3]:
                intent_kw.extend(item.get("categories", [])[:2])

            return ExternalSearchResult(
                provider="g2",
                success=True,
                query=company_domain,
                items=items[:5],
                intent_keywords=list(dict.fromkeys(intent_kw))[:10],
                raw=data if isinstance(data, dict) else {"data": data},
                mock=False,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("G2Provider API call failed: %s", exc)
            return ExternalSearchResult(
                provider="g2",
                success=False,
                query=company_domain,
                error=str(exc),
            )

    def _mock_search(
        self,
        company_domain: str,
        company_name: str | None,
        keywords: list[str] | None,
    ) -> ExternalSearchResult:
        name = company_name or company_domain.split(".")[0].title()
        logger.debug("G2Provider: returning mock intent for %s", company_domain)
        return ExternalSearchResult(
            provider="g2",
            success=True,
            query=company_domain,
            items=[{
                "company_name": name,
                "category": "Sales Intelligence",
                "review_count": 42,
                "rating": 4.6,
            }],
            intent_keywords=(keywords or []) + ["sales intelligence", "crm comparison", "g2 research"],
            raw={"mock": True},
            mock=True,
        )
