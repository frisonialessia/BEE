"""LinkedIn OAuth handshake — authorize URL, code exchange, refresh.

Mirrors gmail_oauth.py's shape (same three-step flow: authorize → exchange
→ periodic refresh), talking to LinkedIn's OAuth 2.0 + OpenID Connect
endpoints directly over HTTP.

Two things are genuinely different from Google here, not oversights:

* **Refresh is best-effort.** LinkedIn only issues a ``refresh_token`` to
  apps with the right product access approved on their Developer Portal —
  a freshly-created app usually won't get one. When absent,
  IntegrationsService already handles a missing refresh_token the same way
  it does for Gmail: the connection surfaces "reconecta" once the access
  token expires, instead of silently failing. Don't request
  ``offline_access`` here as if it were guaranteed; it's opportunistic.
* **No revoke endpoint.** LinkedIn doesn't publish a public token-revoke
  API the way Google does. Disconnecting deletes BEE's own copy of the
  token; the grant itself simply expires on LinkedIn's side (typically
  60 days) or the member revokes it from their own LinkedIn settings.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"

# openid/profile/email identify the connected account for display.
# w_member_social is what LinkedInProvider.send() needs to actually post/
# message on the member's behalf — LinkedIn's app review may require this
# scope to be explicitly approved before it's granted, same "opt-in,
# degrades to mock" posture as everything else in this codebase.
SCOPES = "openid profile email w_member_social"


class LinkedInOAuthError(Exception):
    """Raised when LinkedIn rejects a step of the OAuth handshake."""


@dataclass
class LinkedInTokens:
    access_token: str
    refresh_token: str | None
    expires_at: datetime
    scope: str


def is_configured() -> bool:
    """True once the BEE team has registered a real LinkedIn OAuth app."""
    return bool(
        settings.LINKEDIN_OAUTH_CLIENT_ID
        and settings.LINKEDIN_OAUTH_CLIENT_SECRET
        and settings.LINKEDIN_OAUTH_REDIRECT_URI
    )


def build_authorize_url(state: str) -> str:
    if not is_configured():
        raise LinkedInOAuthError(
            "LinkedIn OAuth isn't configured on this server yet — "
            "LINKEDIN_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI are unset."
        )
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_OAUTH_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_OAUTH_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    }
    return f"{_AUTHORIZE_URL}?{httpx.QueryParams(params)}"


def _tokens_from_response(data: dict[str, Any]) -> LinkedInTokens:
    expires_in = int(data.get("expires_in", 5_184_000))  # LinkedIn default: 60 days
    return LinkedInTokens(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        expires_at=datetime.now(UTC) + timedelta(seconds=expires_in),
        scope=data.get("scope", SCOPES),
    )


def exchange_code_for_tokens(code: str) -> LinkedInTokens:
    if not is_configured():
        raise LinkedInOAuthError("LinkedIn OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            _TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.LINKEDIN_OAUTH_CLIENT_ID,
                "client_secret": settings.LINKEDIN_OAUTH_CLIENT_SECRET,
                "redirect_uri": settings.LINKEDIN_OAUTH_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("LinkedIn token exchange failed: %s", exc)
        raise LinkedInOAuthError("LinkedIn rejected the authorization code.") from exc
    return _tokens_from_response(resp.json())


def refresh_access_token(refresh_token: str) -> LinkedInTokens:
    """Exchange a stored refresh_token for a fresh access_token.

    Raises :class:`LinkedInOAuthError` if LinkedIn rejects it — including
    the common case where this app was never granted refresh capability at
    all, which looks the same from here as an expired/revoked token. The
    caller (IntegrationsService) treats either as "reconnect needed".
    """
    if not is_configured():
        raise LinkedInOAuthError("LinkedIn OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            _TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.LINKEDIN_OAUTH_CLIENT_ID,
                "client_secret": settings.LINKEDIN_OAUTH_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("LinkedIn token refresh failed: %s", exc)
        raise LinkedInOAuthError(
            "LinkedIn rejected the refresh token — the connection needs to be redone."
        ) from exc
    return _tokens_from_response(resp.json())


def fetch_account_info(access_token: str) -> str | None:
    """Look up the LinkedIn account's email for display — never fails loudly
    (purely cosmetic, same contract as gmail_oauth.fetch_account_email)."""
    try:
        resp = httpx.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("email") or data.get("name")
    except httpx.HTTPError as exc:
        logger.warning("LinkedIn userinfo lookup failed (non-fatal): %s", exc)
        return None
