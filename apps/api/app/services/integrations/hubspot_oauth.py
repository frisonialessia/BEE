"""HubSpot OAuth handshake — authorize URL, code exchange, refresh.

Same three-step shape as gmail_oauth.py/linkedin_oauth.py/
salesforce_oauth.py, closer to Gmail than Salesforce structurally: HubSpot
has one fixed API host (api.hubapi.com) rather than a per-account
instance_url, and its token response carries a real expires_in (unlike
Salesforce's, which never advertises one).

Deliberately scoped to connect/disconnect + a one-way read import
------------------------------------------------------------------
Same reasoning as Salesforce (see that module's own docstring): BEE reads
standard HubSpot fields into its own Company/Lead/Opportunity tables
(hubspot_import.py) and never writes back — a customer's real pipeline
stages, custom properties, and deal stage mapping aren't something this
integration guesses at.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize"
TOKEN_URL = "https://api.hubapi.com/oauth/v1/token"
# Read-only, standard CRM objects only — see hubspot_import.py's own
# docstring for exactly which fields.
SCOPES = "crm.objects.companies.read crm.objects.contacts.read crm.objects.deals.read"


class HubSpotOAuthError(Exception):
    """Raised when HubSpot rejects a step of the OAuth handshake."""


@dataclass
class HubSpotTokens:
    access_token: str
    refresh_token: str | None
    scope: str
    expires_at: datetime


def is_configured() -> bool:
    """True once the BEE team has registered a real HubSpot app."""
    return bool(
        settings.HUBSPOT_OAUTH_CLIENT_ID
        and settings.HUBSPOT_OAUTH_CLIENT_SECRET
        and settings.HUBSPOT_OAUTH_REDIRECT_URI
    )


def build_authorize_url(state: str) -> str:
    if not is_configured():
        raise HubSpotOAuthError(
            "HubSpot OAuth isn't configured on this server yet — "
            "HUBSPOT_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI are unset."
        )
    params = {
        "client_id": settings.HUBSPOT_OAUTH_CLIENT_ID,
        "redirect_uri": settings.HUBSPOT_OAUTH_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{httpx.QueryParams(params)}"


def _tokens_from_response(data: dict[str, Any]) -> HubSpotTokens:
    # expires_in is in seconds and, unlike Salesforce, actually meaningful
    # here — a small safety margin so a token isn't treated as fresh right
    # up to the literal second it expires.
    expires_in = int(data.get("expires_in", 1800))
    return HubSpotTokens(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        scope=data.get("scope", SCOPES),
        expires_at=datetime.now(UTC) + timedelta(seconds=max(expires_in - 60, 60)),
    )


def exchange_code_for_tokens(code: str) -> HubSpotTokens:
    if not is_configured():
        raise HubSpotOAuthError("HubSpot OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.HUBSPOT_OAUTH_CLIENT_ID,
                "client_secret": settings.HUBSPOT_OAUTH_CLIENT_SECRET,
                "redirect_uri": settings.HUBSPOT_OAUTH_REDIRECT_URI,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("HubSpot token exchange failed: %s", exc)
        raise HubSpotOAuthError("HubSpot rejected the authorization code.") from exc
    return _tokens_from_response(resp.json())


def refresh_access_token(refresh_token: str) -> HubSpotTokens:
    if not is_configured():
        raise HubSpotOAuthError("HubSpot OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.HUBSPOT_OAUTH_CLIENT_ID,
                "client_secret": settings.HUBSPOT_OAUTH_CLIENT_SECRET,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("HubSpot token refresh failed: %s", exc)
        raise HubSpotOAuthError(
            "HubSpot rejected the refresh token — the connection needs to be redone."
        ) from exc
    data = resp.json()
    # HubSpot's refresh response does include a fresh refresh_token, but
    # fall back to the one we already have the same way Salesforce's
    # module does, in case that ever changes.
    data.setdefault("refresh_token", refresh_token)
    return _tokens_from_response(data)


def fetch_account_label(access_token: str) -> str | None:
    """The connected HubSpot account's own domain, for display in the UI —
    ("conectado a mycompany.hubspot.com") — purely cosmetic, best-effort."""
    try:
        resp = httpx.get(
            f"https://api.hubapi.com/oauth/v1/access-tokens/{access_token}",
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json().get("hub_domain")
    except httpx.HTTPError as exc:
        logger.warning("HubSpot account-label lookup failed (non-fatal): %s", exc)
        return None
