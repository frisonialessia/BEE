"""Salesforce OAuth handshake — authorize URL, code exchange, refresh.

Same three-step shape as gmail_oauth.py/linkedin_oauth.py, with one real
structural difference: Salesforce's token response includes an
``instance_url`` (e.g. ``https://mycompany.my.salesforce.com``) that every
subsequent API call must target — there's no single fixed API host the way
there's ``gmail.googleapis.com``. See IntegrationConnection.instance_url.

Deliberately scoped to connect/disconnect only
------------------------------------------------
Gmail and LinkedIn go straight from "connected" to "useful" because
sending an email or a LinkedIn message needs no knowledge of the other
side's configuration. Salesforce is different: writing a record means
knowing THIS org's object schema — custom fields, required fields,
Opportunity stage picklist values (rarely the stock "Prospecting"/"Closed
Won"), record types. Guessing that mapping and writing to a customer's
real Salesforce would risk silently corrupting their CRM data or failing
opaquely — worse than not building it. So this module (and the
connect/disconnect endpoints built on it) intentionally stops at "BEE can
authenticate to your Salesforce org" — actually pushing/pulling records is
follow-up work once someone can describe the real field mapping to use.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# `api` — access the REST/SOAP APIs (needed for any future sync work).
# `refresh_token offline_access` — get a refresh_token back at all.
SCOPES = "api refresh_token offline_access"


class SalesforceOAuthError(Exception):
    """Raised when Salesforce rejects a step of the OAuth handshake."""


@dataclass
class SalesforceTokens:
    access_token: str
    refresh_token: str | None
    instance_url: str
    scope: str
    # Salesforce access tokens don't advertise a fixed lifetime the way
    # Google/LinkedIn's do — sessions are typically valid for hours and
    # invalidated by policy, not a predictable expires_in. Treat them as
    # needing a refresh attempt on any 401 rather than a scheduled expiry;
    # this fixed window just keeps IntegrationsService's shared "refresh if
    # near expires_at" logic working the same way for every provider.
    expires_at: datetime


def _authorize_url() -> str:
    return f"{settings.SALESFORCE_LOGIN_URL}/services/oauth2/authorize"


def _token_url() -> str:
    return f"{settings.SALESFORCE_LOGIN_URL}/services/oauth2/token"


def is_configured() -> bool:
    """True once the BEE team has registered a real Salesforce Connected App."""
    return bool(
        settings.SALESFORCE_OAUTH_CLIENT_ID
        and settings.SALESFORCE_OAUTH_CLIENT_SECRET
        and settings.SALESFORCE_OAUTH_REDIRECT_URI
    )


def build_authorize_url(state: str) -> str:
    if not is_configured():
        raise SalesforceOAuthError(
            "Salesforce OAuth isn't configured on this server yet — "
            "SALESFORCE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI are unset."
        )
    params = {
        "response_type": "code",
        "client_id": settings.SALESFORCE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.SALESFORCE_OAUTH_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    }
    return f"{_authorize_url()}?{httpx.QueryParams(params)}"


def _tokens_from_response(data: dict[str, Any]) -> SalesforceTokens:
    return SalesforceTokens(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        instance_url=data["instance_url"],
        scope=data.get("scope", SCOPES),
        # See SalesforceTokens.expires_at docstring — a conservative
        # placeholder window, not a value Salesforce itself returns.
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )


def exchange_code_for_tokens(code: str) -> SalesforceTokens:
    if not is_configured():
        raise SalesforceOAuthError("Salesforce OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            _token_url(),
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.SALESFORCE_OAUTH_CLIENT_ID,
                "client_secret": settings.SALESFORCE_OAUTH_CLIENT_SECRET,
                "redirect_uri": settings.SALESFORCE_OAUTH_REDIRECT_URI,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Salesforce token exchange failed: %s", exc)
        raise SalesforceOAuthError("Salesforce rejected the authorization code.") from exc
    return _tokens_from_response(resp.json())


def refresh_access_token(refresh_token: str) -> SalesforceTokens:
    if not is_configured():
        raise SalesforceOAuthError("Salesforce OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            _token_url(),
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.SALESFORCE_OAUTH_CLIENT_ID,
                "client_secret": settings.SALESFORCE_OAUTH_CLIENT_SECRET,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Salesforce token refresh failed: %s", exc)
        raise SalesforceOAuthError(
            "Salesforce rejected the refresh token — the connection needs to be redone."
        ) from exc
    data = resp.json()
    # Salesforce's refresh response omits refresh_token (it's long-lived,
    # reused as-is) — _tokens_from_response would otherwise read this as
    # "no refresh_token", losing it. IntegrationsService already keeps the
    # previously-stored one when a fresh response doesn't include one, same
    # as it does for Gmail/LinkedIn, so this is belt-and-suspenders: make
    # that explicit here too rather than relying only on that fallback.
    data.setdefault("refresh_token", refresh_token)
    return _tokens_from_response(data)


def org_label(instance_url: str) -> str:
    """The connected org's pod hostname, for display in the UI —
    ("conectado a mycompany.my.salesforce.com") — purely cosmetic."""
    return instance_url.replace("https://", "").replace("http://", "")
