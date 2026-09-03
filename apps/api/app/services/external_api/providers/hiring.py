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
mock mode never fabricating a result.

Lever (``api.lever.co/v0/postings/<slug>``) is the second board checked,
with the same slug guess and the same "404 is a clean zero" contract —
between the two they cover most venture-backed companies' public
postings. Whichever board answers first with enough roles wins; a
company on neither is simply a company with no hiring signal today.
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
_LEVER_POSTINGS_API = "https://api.lever.co/v0/postings/{slug}?mode=json"

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
        """Returns at most one item — a hiring-surge summary — when a guessed
        board (Greenhouse first, then Lever) exists and has enough open
        roles to be meaningfully "surging" (see _SURGE_THRESHOLD). Anything
        short of that (board not found, few roles) is a clean zero-item
        success, not an error: a wrong slug guess is expected and common,
        not a provider failure. A transport error on one board does not
        stop the other from being tried.
        """
        slug = _guess_greenhouse_slug(company_domain)
        name = company_name or company_domain

        last_error: str | None = None
        for board, url, parse in (
            ("greenhouse", _GREENHOUSE_BOARDS_API.format(slug=slug), _parse_greenhouse),
            ("lever", _LEVER_POSTINGS_API.format(slug=slug), _parse_lever),
        ):
            try:
                with httpx.Client(timeout=8.0) as client:
                    resp = client.get(url)
                    if resp.status_code == 404:
                        # Wrong slug guess or genuinely not on this ATS —
                        # the expected common case, not a warning-worthy one.
                        continue
                    resp.raise_for_status()
                    data = resp.json()
            except Exception as exc:  # noqa: BLE001
                logger.warning("HiringProvider %s lookup failed for slug=%s: %s", board, slug, exc)
                last_error = str(exc)
                continue

            jobs = parse(data)
            if len(jobs) < _SURGE_THRESHOLD:
                continue

            gtm_count = sum(1 for job in jobs if _is_gtm(job))
            detail = f"including {gtm_count} in Sales/GTM roles" if gtm_count else "across multiple teams"
            title = f"{name} has {len(jobs)} open positions {detail} — hiring surge"
            board_url = (
                f"https://boards.greenhouse.io/{slug}" if board == "greenhouse" else f"https://jobs.lever.co/{slug}"
            )
            return ExternalSearchResult(
                provider="hiring",
                success=True,
                query=slug,
                items=[
                    {
                        "title": title,
                        "link": board_url,
                        "snippet": f"{len(jobs)} open roles found on {name}'s {board.title()} board.",
                    }
                ],
                raw={"job_count": len(jobs), "gtm_count": gtm_count, "slug": slug, "board": board},
                mock=False,
            )

        if last_error is not None:
            return ExternalSearchResult(provider="hiring", success=False, query=slug, error=last_error)
        return ExternalSearchResult(provider="hiring", success=True, query=slug, items=[])


def _parse_greenhouse(data: object) -> list[dict]:
    """boards-api answers ``{"jobs": [{"title", "departments": [...]}]}``."""
    if not isinstance(data, dict):
        return []
    return [j for j in data.get("jobs", []) if isinstance(j, dict)]


def _parse_lever(data: object) -> list[dict]:
    """Lever answers a bare list of postings with ``text`` as the title and
    ``categories.team``/``department`` — normalized to the Greenhouse shape
    so the surge/GTM logic above is board-agnostic."""
    if not isinstance(data, list):
        return []
    jobs: list[dict] = []
    for posting in data:
        if not isinstance(posting, dict):
            continue
        categories = posting.get("categories") or {}
        jobs.append(
            {
                "title": posting.get("text") or "",
                "departments": [categories.get("team") or "", categories.get("department") or ""],
            }
        )
    return jobs


def _is_gtm(job: dict) -> bool:
    departments = str(job.get("departments") or "").lower()
    title = (job.get("title") or "").lower()
    return any(kw in departments for kw in _GTM_DEPARTMENT_KEYWORDS) or any(
        kw in title for kw in _GTM_DEPARTMENT_KEYWORDS
    )
