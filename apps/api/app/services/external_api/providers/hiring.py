"""HiringProvider — a rep-budget signal from public job-board data.

A company opening several roles at once (especially Sales/Engineering) is
one of the more reliable "they have budget and are scaling" signals a
market scan can surface, without needing a paid data vendor. This
provider reads Greenhouse's public, unauthenticated boards-api
(`boards-api.greenhouse.io`) — no account, no API key.

Why a domain-to-slug guess, and why that's an acceptable limitation
----------------------------------------------------------------------
Greenhouse board slugs (`boards.greenhouse.io/<slug>`) aren't derived from
a company's domain by any guaranteed rule — a company's own slug choice is
whatever they picked, sometimes exactly their brand name, sometimes not.
This provider tries the domain's root label (`acme.com` -> `acme`) as an
*educated guess*, not a lookup — most Greenhouse-hosted companies do use
something close to their brand name. A wrong guess is a 404 from
Greenhouse, treated exactly like "this account isn't on Greenhouse" (a
clean zero, not an error) — see search_market_news's docstring on why
that's the honest behavior, same discipline as GoogleSearchProvider's own
mock mode never fabricating a result. This deliberately does not attempt
Ashby, Lever, or any other ATS in this revision — one real, working
integration beats three partial guesses; add the next ATS here as its own
method once this one has proven the pattern in production.
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

_GREENHOUSE_BOARDS_API = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"

# A company with fewer open roles than this isn't "surging" — just normal
# background hiring every company does. Keeps this signal meaningfully
# rare instead of firing for every tracked account that has any job posted.
_SURGE_THRESHOLD = 5

# Departments treated as a stronger go-to-market signal than headcount
# growth in general — hiring AEs/SDRs is a much more direct "they're about
# to spend more on sales tooling" tell than, say, hiring warehouse staff.
_GTM_DEPARTMENT_KEYWORDS = ("sales", "account executive", "sdr", "business development")


def _guess_greenhouse_slug(company_domain: str) -> str:
    """acme.com -> acme; app.acme.io -> acme. Best-effort, see module docstring."""
    root = company_domain.split(".")[0] if "." in company_domain else company_domain
    return root.lower().replace(" ", "").replace("-", "")


class HiringProvider(IExternalProvider):
    """Greenhouse public-boards hiring-surge signal."""

    name = "hiring"  # type: ignore[assignment]
    rate_limit = RateLimitConfig(requests_per_hour=100, min_interval_seconds=1.0)

    def is_configured(self) -> bool:
        # No credentials to configure — Greenhouse's boards-api is public.
        # "Configured" here means "capable of a live call," which is
        # always true; a wrong slug guess is a per-company empty result,
        # not a provider-level unconfigured state.
        return True

    def fetch_lead_profile(self, **kwargs) -> ExternalProfileResult:  # noqa: ARG002
        return ExternalProfileResult(
            provider="hiring",
            success=False,
            error="HiringProvider only supports search_market_news (job-posting counts), not lead profiles.",
        )

    def search_market_news(
        self, *, company_domain: str, company_name: str | None = None
    ) -> ExternalSearchResult:
        """Returns at most one item — a hiring-surge summary — when the
        guessed Greenhouse board exists and has enough open roles to be
        meaningfully "surging" (see _SURGE_THRESHOLD). Anything short of
        that (board not found, few roles) is a clean zero-item success,
        not an error: a wrong slug guess is expected and common, not a
        provider failure.
        """
        slug = _guess_greenhouse_slug(company_domain)
        name = company_name or company_domain
        url = _GREENHOUSE_BOARDS_API.format(slug=slug)

        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.get(url)
                if resp.status_code == 404:
                    # Wrong slug guess or genuinely not on Greenhouse —
                    # the expected common case, not a warning-worthy one.
                    return ExternalSearchResult(provider="hiring", success=True, query=slug, items=[])
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("HiringProvider Greenhouse lookup failed for slug=%s: %s", slug, exc)
            return ExternalSearchResult(provider="hiring", success=False, query=slug, error=str(exc))

        jobs = data.get("jobs", [])
        if len(jobs) < _SURGE_THRESHOLD:
            return ExternalSearchResult(provider="hiring", success=True, query=slug, items=[], raw=data)

        gtm_count = sum(
            1
            for job in jobs
            if any(kw in (job.get("departments") and str(job["departments"]).lower() or "") for kw in _GTM_DEPARTMENT_KEYWORDS)
            or any(kw in (job.get("title") or "").lower() for kw in _GTM_DEPARTMENT_KEYWORDS)
        )
        detail = f"including {gtm_count} in Sales/GTM roles" if gtm_count else "across multiple teams"
        title = f"{name} has {len(jobs)} open positions {detail} — hiring surge"

        return ExternalSearchResult(
            provider="hiring",
            success=True,
            query=slug,
            items=[
                {
                    "title": title,
                    "link": f"https://boards.greenhouse.io/{slug}",
                    "snippet": f"{len(jobs)} open roles found on {name}'s Greenhouse board.",
                }
            ],
            raw={"job_count": len(jobs), "gtm_count": gtm_count, "slug": slug},
            mock=False,
        )
