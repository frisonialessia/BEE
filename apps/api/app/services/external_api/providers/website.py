"""WebsiteEnrichmentProvider — the "one domain, full account" data source.

Populating a company record from nothing but its domain needs at least a
name and a description a human didn't type. This provider fetches the
domain's homepage over plain HTTPS (no account, no API key — same
no-credentials shape as HiringProvider) and pulls out exactly three things a
homepage reliably carries: the page ``<title>``, the ``og:site_name`` meta
tag (when present, a cleaner brand name than the title), and the meta
description.

Deliberately does not guess industry or company size
------------------------------------------------------
A regex scrape of a homepage cannot reliably tell "we sell CRM software" from
"we sell industrial pumps" — a keyword heuristic here would be exactly the
kind of plausible-looking fabricated data this codebase's "cero datos
inventados" rule exists to prevent (see CLAUDE.md and GoogleSearchProvider's
own mock-mode docstring on the same principle). ``company_industry`` and
``company_size`` are left ``None`` on every result; a future LLM-based
classification pass is the honest way to fill those in, not a keyword guess
here. Same "one real capability beats a fake broad one" discipline as
HiringProvider limiting itself to Greenhouse only.

Why regex instead of an HTML parser
-------------------------------------
``<title>``, ``og:site_name``, and a meta description are three narrow,
well-known tag shapes — extracting them doesn't need a DOM parser dependency
(no ``lxml``/``beautifulsoup4`` in requirements.txt today, and this is the
only caller that would need one). The patterns are deliberately tight and
non-greedy; a homepage that doesn't match any of them yields an
still-successful result with just fewer fields filled, never an error.
"""

from __future__ import annotations

import re

import httpx

from app.core.logging import get_logger
from app.services.external_api.interface import (
    ExternalProfileResult,
    ExternalSearchResult,
    IExternalProvider,
    RateLimitConfig,
)

logger = get_logger(__name__)

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_OG_SITE_NAME_RE = re.compile(
    r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']*)["\']', re.IGNORECASE
)
_META_DESCRIPTION_RE = re.compile(
    r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', re.IGNORECASE
)
# A meta tag's attribute order isn't guaranteed — content before name/property
# is just as valid HTML. One extra pattern per tag, tried second, covers that
# without a real HTML parser.
_OG_SITE_NAME_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']og:site_name["\']', re.IGNORECASE
)
_META_DESCRIPTION_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']', re.IGNORECASE
)

_MAX_DESCRIPTION_LEN = 500  # well under CompanyCreateIn.description's 2000-char cap


def _clean(text: str) -> str:
    """Collapse whitespace and unescape the handful of HTML entities that
    show up in real titles/descriptions (&amp; &mdash; ...) without pulling
    in a full HTML-unescape dependency for five entities."""
    text = re.sub(r"\s+", " ", text).strip()
    for entity, char in (("&amp;", "&"), ("&mdash;", "—"), ("&ndash;", "–"), ("&#39;", "'"), ("&quot;", '"')):
        text = text.replace(entity, char)
    return text


def _first_match(html: str, *patterns: re.Pattern[str]) -> str | None:
    for pattern in patterns:
        match = pattern.search(html)
        if match and match.group(1).strip():
            return _clean(match.group(1))
    return None


class WebsiteEnrichmentProvider(IExternalProvider):
    """Homepage title/description scrape — no credentials, one HTTP GET."""

    name = "website"  # type: ignore[assignment]
    rate_limit = RateLimitConfig(requests_per_hour=200, min_interval_seconds=0.5)

    def is_configured(self) -> bool:
        # Same reasoning as HiringProvider: nothing to configure, a fetch
        # failure is a per-domain empty result, not a provider-level state.
        return True

    def fetch_lead_profile(self, **kwargs) -> ExternalProfileResult:  # noqa: ARG002
        return ExternalProfileResult(
            provider="website",
            success=False,
            error="WebsiteEnrichmentProvider only supports enrich_company, not lead profiles.",
        )

    def search_intent(self, **kwargs) -> ExternalSearchResult:  # noqa: ARG002
        return ExternalSearchResult(
            provider="website",
            success=False,
            query=kwargs.get("company_domain", ""),
            error="WebsiteEnrichmentProvider does not support intent search.",
        )

    def enrich_company(self, *, company_domain: str) -> ExternalProfileResult:
        """Fetch ``company_domain``'s homepage and extract a name and
        description. A fetch failure (DNS, timeout, non-2xx, no matching
        tags) is a clean unsuccessful-but-non-fatal result — the caller
        (see app.services.external_api.orchestrator.enrich_company_from_domain)
        treats it the same way MarketScanOrchestrator treats a 404 from
        Greenhouse: expected, not an error worth surfacing to the user.
        """
        domain = company_domain.strip().lower()
        url = f"https://{domain}"

        try:
            with httpx.Client(timeout=8.0, follow_redirects=True) as client:
                resp = client.get(url, headers={"User-Agent": "BEE-AccountEnrichment/1.0"})
                resp.raise_for_status()
                html = resp.text
        except Exception as exc:  # noqa: BLE001
            logger.info("WebsiteEnrichmentProvider: fetch failed for domain=%s: %s", domain, exc)
            return ExternalProfileResult(
                provider="website", success=False, company_domain=domain, error=str(exc)
            )

        site_name = _first_match(html, _OG_SITE_NAME_RE, _OG_SITE_NAME_RE_ALT)
        title = _first_match(html, _TITLE_RE)
        description = _first_match(html, _META_DESCRIPTION_RE, _META_DESCRIPTION_RE_ALT)
        if description and len(description) > _MAX_DESCRIPTION_LEN:
            description = description[:_MAX_DESCRIPTION_LEN].rsplit(" ", 1)[0] + "…"

        # og:site_name is usually just the brand ("Acme") where <title> is
        # often "Acme — CRM for small teams" (brand + tagline) — prefer the
        # cleaner one for a company *name*, fall back to title when there's
        # no og:site_name at all.
        name = site_name or title

        return ExternalProfileResult(
            provider="website",
            success=bool(name or description),
            company_name=name,
            company_domain=domain,
            company_description=description,
            raw={"title": title, "og_site_name": site_name},
            mock=False,
        )
