"""Jira OAuth handshake — authorize URL, code exchange, refresh.

Same three-step shape as gmail_oauth.py/linkedin_oauth.py/
salesforce_oauth.py/hubspot_oauth.py, but Jira Cloud's OAuth 2.0 (3LO) has
two details none of those need to handle:

1. **No fixed API host, and no per-account URL handed back at token time
   either** (unlike Salesforce's instance_url) — every Jira Cloud API call
   goes through ``https://api.atlassian.com/ex/jira/{cloudId}/...``, and
   the ``cloudId`` is only discoverable by calling
   ``GET /oauth/token/accessible-resources`` *with* the fresh access
   token, right after exchange. So :func:`exchange_code_for_tokens` here
   does two HTTP calls where every other provider's does one. An
   Atlassian account can have access to more than one Jira site; this
   connects to the first one returned, same simplification
   hubspot_import.py/salesforce_import.py make for "one CRM org" — a
   second site needs a second BEE organization to connect it under.

2. **Refresh tokens rotate.** Atlassian invalidates the refresh token the
   moment it's used and issues a new one in the same response — unlike
   Gmail (never re-issues one) or HubSpot (does, but the old one would
   still work). :func:`refresh_access_token`'s returned
   :class:`JiraTokens.refresh_token` is therefore never a fallback to the
   previous value the way hubspot_oauth.py's is; the caller (see
   ``IntegrationsService._get_valid_connection``) must persist whatever
   comes back or the *next* refresh fails outright.

``JiraTokens.instance_url`` holds the resolved ``cloudId`` for this
Jira site, not a URL — reusing ``IntegrationConnection.instance_url``'s
already-generic "provider extra id" column (the same one Salesforce's
instance_url populates) rather than adding a Jira-only one.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

AUTHORIZE_URL = "https://auth.atlassian.com/authorize"
TOKEN_URL = "https://auth.atlassian.com/oauth/token"
ACCESSIBLE_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"
API_AUDIENCE = "api.atlassian.com"
# offline_access is what makes Atlassian issue a refresh_token at all.
SCOPES = "read:jira-work write:jira-work offline_access"


class JiraOAuthError(Exception):
    """Raised when Jira/Atlassian rejects a step of the OAuth handshake."""


@dataclass
class JiraTokens:
    access_token: str
    refresh_token: str | None
    scope: str
    expires_at: datetime
    #: The resolved Jira Cloud site id — see module docstring. ``None``
    #: only if resolving it failed, which callers treat as a connect
    #: failure (see ``exchange_code_for_tokens``); a *refreshed* token
    #: keeps the site it already had (see ``IntegrationsService``).
    instance_url: str | None = None
    #: Display label for the connected site (e.g. "yourteam.atlassian.net"),
    #: not persisted on the row beyond the initial connect — purely for the
    #: one-time "conectado a ..." label, same role hubspot_oauth's
    #: fetch_account_label plays for HubSpot.
    site_label: str | None = None


def is_configured() -> bool:
    return bool(settings.JIRA_OAUTH_CLIENT_ID and settings.JIRA_OAUTH_CLIENT_SECRET and settings.JIRA_OAUTH_REDIRECT_URI)


def build_authorize_url(state: str) -> str:
    if not is_configured():
        raise JiraOAuthError(
            "Jira OAuth isn't configured on this server yet — "
            "JIRA_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI are unset."
        )
    params = {
        "audience": API_AUDIENCE,
        "client_id": settings.JIRA_OAUTH_CLIENT_ID,
        "scope": SCOPES,
        "redirect_uri": settings.JIRA_OAUTH_REDIRECT_URI,
        "state": state,
        "response_type": "code",
        # Atlassian silently reuses a still-valid prior grant without this,
        # which would skip the site-picker for a user connected to more
        # than one Jira site — always show it so "which site" is explicit.
        "prompt": "consent",
    }
    return f"{AUTHORIZE_URL}?{httpx.QueryParams(params)}"


def _resolve_site(access_token: str) -> tuple[str | None, str | None]:
    """Returns ``(cloud_id, site_label)`` for the first Jira site this
    token can reach — see module docstring on why "first" and why this is
    a second HTTP call."""
    try:
        resp = httpx.get(
            ACCESSIBLE_RESOURCES_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            timeout=10.0,
        )
        resp.raise_for_status()
        resources = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("Jira accessible-resources lookup failed: %s", exc)
        return None, None
    if not resources:
        return None, None
    first = resources[0]
    return first.get("id"), first.get("name") or first.get("url")


def _tokens_from_response(data: dict[str, Any], *, resolve_site: bool) -> JiraTokens:
    expires_in = int(data.get("expires_in", 3600))
    access_token = data["access_token"]
    cloud_id, site_label = _resolve_site(access_token) if resolve_site else (None, None)
    return JiraTokens(
        access_token=access_token,
        refresh_token=data.get("refresh_token"),
        scope=data.get("scope", SCOPES),
        expires_at=datetime.now(UTC) + timedelta(seconds=max(expires_in - 60, 60)),
        instance_url=cloud_id,
        site_label=site_label,
    )


def exchange_code_for_tokens(code: str) -> JiraTokens:
    if not is_configured():
        raise JiraOAuthError("Jira OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            TOKEN_URL,
            json={
                "grant_type": "authorization_code",
                "client_id": settings.JIRA_OAUTH_CLIENT_ID,
                "client_secret": settings.JIRA_OAUTH_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.JIRA_OAUTH_REDIRECT_URI,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Jira token exchange failed: %s", exc)
        raise JiraOAuthError("Jira rejected the authorization code.") from exc
    tokens = _tokens_from_response(resp.json(), resolve_site=True)
    if not tokens.instance_url:
        raise JiraOAuthError(
            "Connected to Atlassian, but couldn't find an accessible Jira site — "
            "make sure the account has access to at least one Jira Cloud site."
        )
    return tokens


def refresh_access_token(refresh_token: str) -> JiraTokens:
    """No need to re-resolve the site on every refresh (see module
    docstring: ``instance_url`` isn't touched on a refresh by
    ``IntegrationsService`` unless a fresh one is actually returned here),
    so this skips the extra accessible-resources call refresh calls don't
    need."""
    if not is_configured():
        raise JiraOAuthError("Jira OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            TOKEN_URL,
            json={
                "grant_type": "refresh_token",
                "client_id": settings.JIRA_OAUTH_CLIENT_ID,
                "client_secret": settings.JIRA_OAUTH_CLIENT_SECRET,
                "refresh_token": refresh_token,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Jira token refresh failed: %s", exc)
        raise JiraOAuthError("Jira rejected the refresh token — the connection needs to be redone.") from exc
    return _tokens_from_response(resp.json(), resolve_site=False)
