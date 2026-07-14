"""LinkedIn provider — lead profile enrichment via LinkedIn API v2.

When ``LINKEDIN_ACCESS_TOKEN`` is configured, calls the real LinkedIn People API.
Otherwise returns a deterministic mock profile so the full ingestion pipeline
can be tested without credentials.

API reference: https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.logging import get_logger
from app.services.external_api.interface import (
    ExternalProfileResult,
    IExternalProvider,
    RateLimitConfig,
)
from app.services.secret_manager import get_secret_manager

logger = get_logger(__name__)

_LINKEDIN_API = "https://api.linkedin.com/v2"


class LinkedInProvider(IExternalProvider):
    """Fetch lead profiles from LinkedIn (Sales Navigator / REST API)."""

    name = "linkedin"  # type: ignore[assignment]
    rate_limit = RateLimitConfig(requests_per_hour=100, min_interval_seconds=5.0)

    def is_configured(self) -> bool:
        return get_secret_manager().is_configured("linkedin")

    def fetch_lead_profile(
        self,
        *,
        linkedin_url: str | None = None,
        email: str | None = None,
        full_name: str | None = None,
        company_domain: str | None = None,
    ) -> ExternalProfileResult:
        if not self.is_configured():
            return self._mock_profile(linkedin_url, email, full_name, company_domain)

        token = get_secret_manager().get("linkedin").access_token
        if not token:
            return self._mock_profile(linkedin_url, email, full_name, company_domain)

        # Resolve LinkedIn member ID from URL if provided
        member_id = self._extract_member_id(linkedin_url) if linkedin_url else None

        try:
            if member_id:
                data = self._api_get(
                    f"{_LINKEDIN_API}/people/(id:{member_id})",
                    token,
                    params={
                        "projection": (
                            "(id,firstName,lastName,headline,location,positions)"
                        ),
                    },
                )
            else:
                # Fallback: people search by email (requires appropriate OAuth scope)
                data = self._search_by_email(email, token) if email else {}

            return self._parse_profile(data, linkedin_url)

        except httpx.HTTPStatusError as exc:
            lookup = "member_id" if member_id else "email"
            status = exc.response.status_code
            logger.warning(
                "LinkedInProvider: HTTP %s from LinkedIn API (lookup=%s) — profile enrichment skipped",
                status,
                lookup,
            )
            return ExternalProfileResult(
                provider="linkedin",
                success=False,
                error=f"LinkedIn API returned HTTP {status}",
                linkedin_url=linkedin_url,
            )
        except httpx.RequestError as exc:
            lookup = "member_id" if member_id else "email"
            logger.warning(
                "LinkedInProvider: network error reaching LinkedIn API "
                "(lookup=%s error_type=%s) — %s",
                lookup,
                type(exc).__name__,
                exc,
            )
            return ExternalProfileResult(
                provider="linkedin",
                success=False,
                error=f"LinkedIn API unreachable ({type(exc).__name__})",
                linkedin_url=linkedin_url,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "LinkedInProvider: unexpected error (error_type=%s) — %s",
                type(exc).__name__,
                exc,
            )
            return ExternalProfileResult(
                provider="linkedin",
                success=False,
                error=f"LinkedIn enrichment failed ({type(exc).__name__})",
                linkedin_url=linkedin_url,
            )

    def _api_get(self, url: str, token: str, params: dict[str, Any] | None = None) -> dict:
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Restli-Protocol-Version": "2.0.0",
        }
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=headers, params=params or {})
            resp.raise_for_status()
            return resp.json()

    def _search_by_email(self, email: str, token: str) -> dict:
        # LinkedIn email lookup requires Marketing Developer Platform access
        url = f"{_LINKEDIN_API}/emailAddress?q=members&email={email}"
        return self._api_get(url, token)

    def _parse_profile(self, data: dict, linkedin_url: str | None) -> ExternalProfileResult:
        if not data:
            return ExternalProfileResult(
                provider="linkedin",
                success=False,
                error="Empty profile response",
                linkedin_url=linkedin_url,
            )

        first = (data.get("firstName") or {}).get("localized", {})
        last = (data.get("lastName") or {}).get("localized", {})
        first_name = next(iter(first.values()), "") if first else ""
        last_name = next(iter(last.values()), "") if last else ""
        full_name = f"{first_name} {last_name}".strip() or None

        headline = None
        loc = data.get("location") or {}
        if isinstance(loc, dict):
            headline = loc.get("name")

        title = None
        company = None
        positions = data.get("positions") or {}
        elements = positions.get("elements") or positions if isinstance(positions, list) else []
        if isinstance(positions, dict):
            elements = positions.get("elements", [])
        if elements:
            current = elements[0]
            title = (current.get("title") or {}).get("localized", {})
            title = next(iter(title.values()), None) if isinstance(title, dict) else current.get("title")
            comp = current.get("company") or {}
            company = comp.get("name") or comp.get("localizedName")

        return ExternalProfileResult(
            provider="linkedin",
            success=True,
            lead_name=full_name,
            lead_title=title,
            company_name=company,
            linkedin_url=linkedin_url,
            headline=data.get("headline"),
            location=headline,
            raw=data,
            mock=False,
        )

    def _extract_member_id(self, url: str) -> str | None:
        # Handles /in/username or /profile/view?id=ACoAAA...
        match = re.search(r"linkedin\.com/in/([^/?#]+)", url)
        if match:
            return match.group(1)
        match = re.search(r"id=([^&]+)", url)
        return match.group(1) if match else None

    def _mock_profile(
        self,
        linkedin_url: str | None,
        email: str | None,
        full_name: str | None,
        company_domain: str | None,
    ) -> ExternalProfileResult:
        """Deterministic mock for development and CI."""
        name = full_name or (email.split("@")[0].replace(".", " ").title() if email else "Alex Rivera")
        domain = company_domain or "example.com"
        company = domain.split(".")[0].title()

        logger.debug("LinkedInProvider: returning mock profile for %s", name)
        return ExternalProfileResult(
            provider="linkedin",
            success=True,
            lead_name=name,
            lead_title="VP Sales",
            lead_seniority="executive",
            company_name=company,
            company_domain=domain,
            linkedin_url=linkedin_url or f"https://linkedin.com/in/{name.lower().replace(' ', '-')}",
            headline=f"Sales leader at {company} | GTM & Revenue Operations",
            location="San Francisco Bay Area",
            raw={"mock": True, "source": "linkedin_mock"},
            mock=True,
        )
