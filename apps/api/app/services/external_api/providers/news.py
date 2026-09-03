"""NewsProvider — press coverage from GDELT, no API key required.

Google Search (``GoogleSearchProvider``) is the better news source when a
deployment has a key and a Custom Search engine configured — but most
early deployments don't, and a market scan that only ever runs the
keyless hiring check has one sense, not two. GDELT's public document API
(``api.gdeltproject.org/api/v2/doc/doc``) indexes worldwide news every 15
minutes and answers a plain HTTP query without credentials, which makes
it the right *default* press sense: always on, zero configuration, and
the Google provider can take over (or add to it) whenever it's configured.

Query discipline
----------------
GDELT ranks by relevance across everything it has crawled; a bare company
name ("Delta") returns noise. The query quotes the exact company name and
requires one of the market-moving keywords the platform actually turns
into a signal (funding, acquisition, launch, expansion, leadership), over
the last 7 days, sorted by date — so an item that comes back is by
construction about *that* company doing *something newsworthy*. Same
"an empty result is the honest answer" contract as the hiring provider:
a fetch error is a failed result, "nothing matched" is a clean success
with zero items, never a fabricated headline.
"""

from __future__ import annotations

import httpx

from app.core.logging import get_logger
from app.services.external_api.interface import (
    ExternalProfileResult,
    ExternalSearchResult,
    IExternalProvider,
    RateLimitConfig,
)

logger = get_logger(__name__)

_GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
_MAX_ITEMS = 5
# The vocabulary that makes a press mention a *signal* rather than a
# mention: each maps loosely onto a SignalType the analyzers already know.
_MARKET_KEYWORDS = (
    "funding",
    "raises",
    "series",
    "acquisition",
    "acquires",
    "launches",
    "expansion",
    "expands",
    "appoints",
    "hires",
    "partnership",
    "IPO",
)


def _build_query(company_name: str) -> str:
    keywords = " OR ".join(_MARKET_KEYWORDS)
    return f'"{company_name}" ({keywords})'


class NewsProvider(IExternalProvider):
    """GDELT press-coverage provider for the market scan."""

    name = "gdelt"  # type: ignore[assignment]
    # GDELT asks for at most one request every ~5 seconds per client.
    rate_limit = RateLimitConfig(requests_per_hour=200, min_interval_seconds=5.0)

    def is_configured(self) -> bool:
        # Keyless by design — see module docstring.
        return True

    def fetch_lead_profile(self, **kwargs) -> ExternalProfileResult:  # noqa: ARG002
        return ExternalProfileResult(
            provider="gdelt",
            success=False,
            error="NewsProvider only supports search_market_news (press coverage), not lead profiles.",
        )

    def search_market_news(
        self, *, company_domain: str, company_name: str | None = None
    ) -> ExternalSearchResult:
        name = (company_name or company_domain.split(".")[0]).strip()
        if not name:
            return ExternalSearchResult(provider="gdelt", success=True, query="", items=[])
        query = _build_query(name)
        params = {
            "query": query,
            "mode": "artlist",
            "format": "json",
            "maxrecords": str(_MAX_ITEMS * 2),
            "timespan": "7d",
            "sort": "datedesc",
        }
        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.get(_GDELT_DOC_API, params=params, headers={"User-Agent": "BEE market scan"})
                resp.raise_for_status()
                # GDELT answers an empty body (not "[]") when nothing matched.
                data = resp.json() if resp.content.strip() else {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("NewsProvider GDELT lookup failed for %s: %s", name, exc)
            return ExternalSearchResult(provider="gdelt", success=False, query=query, error=str(exc))

        articles = data.get("articles", []) if isinstance(data, dict) else []
        items: list[dict] = []
        seen_titles: set[str] = set()
        lowered = name.lower()
        for article in articles:
            title = (article.get("title") or "").strip()
            url = article.get("url")
            if not title or not url:
                continue
            # GDELT's relevance is loose — keep only titles that name the
            # company, and collapse syndicated copies of the same headline.
            if lowered not in title.lower():
                continue
            key = title.lower()
            if key in seen_titles:
                continue
            seen_titles.add(key)
            items.append(
                {
                    "title": title,
                    "link": url,
                    "snippet": f"{article.get('domain') or 'press'} · {article.get('seendate') or ''}".strip(" ·"),
                }
            )
            if len(items) >= _MAX_ITEMS:
                break

        return ExternalSearchResult(
            provider="gdelt",
            success=True,
            query=query,
            items=items,
            raw={"article_count": len(articles)},
            mock=False,
        )
