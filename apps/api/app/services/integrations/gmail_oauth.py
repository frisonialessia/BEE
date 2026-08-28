"""Gmail OAuth handshake — authorize URL, code exchange, refresh, revoke.

Talks to Google's standard OAuth 2.0 + Gmail REST endpoints directly over
HTTP (no google-api-python-client — that pulls in a large dependency tree
for what is, here, three small JSON calls). Nothing in this module touches
the database; it's a pure client for Google's APIs. Persisting the result
is app.services.integrations.service's job.

Scope requested is deliberately minimal: ``gmail.send`` lets BEE send as the
connected account but never read, list, or delete anything in their inbox —
plus ``openid``/``userinfo.email`` purely to label the connection in the UI
("conectado como maria@empresa.com").
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

SCOPES = "openid email https://www.googleapis.com/auth/gmail.send"


class GmailOAuthError(Exception):
    """Raised when Google rejects a step of the OAuth handshake."""


@dataclass
class GmailTokens:
    access_token: str
    refresh_token: str | None
    expires_at: datetime
    scope: str


def is_configured() -> bool:
    """True once the BEE team has registered a real Google OAuth client."""
    return bool(
        settings.GOOGLE_OAUTH_CLIENT_ID
        and settings.GOOGLE_OAUTH_CLIENT_SECRET
        and settings.GOOGLE_OAUTH_REDIRECT_URI
    )


def build_authorize_url(state: str) -> str:
    """Build the Google consent-screen URL the browser should be sent to.

    ``access_type=offline`` + ``prompt=consent`` ensure Google returns a
    refresh_token even on a re-connect (Google only issues one on the FIRST
    consent per account+client otherwise, which would silently leave us
    unable to refresh after a disconnect/reconnect).
    """
    if not is_configured():
        raise GmailOAuthError(
            "Gmail OAuth isn't configured on this server yet — "
            "GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI are unset."
        )
    params = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{_AUTHORIZE_URL}?{httpx.QueryParams(params)}"


def _tokens_from_response(data: dict[str, Any]) -> GmailTokens:
    expires_in = int(data.get("expires_in", 3600))
    return GmailTokens(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        expires_at=datetime.now(UTC) + timedelta(seconds=expires_in),
        scope=data.get("scope", SCOPES),
    )


def exchange_code_for_tokens(code: str) -> GmailTokens:
    """Exchange the one-time authorization ``code`` for access/refresh tokens."""
    if not is_configured():
        raise GmailOAuthError("Gmail OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            _TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Gmail token exchange failed: %s", exc)
        raise GmailOAuthError("Google rejected the authorization code.") from exc
    return _tokens_from_response(resp.json())


def refresh_access_token(refresh_token: str) -> GmailTokens:
    """Exchange a stored refresh_token for a fresh access_token.

    Google never returns a new refresh_token on a refresh call — the
    returned :class:`GmailTokens.refresh_token` is always ``None`` here;
    callers must keep the original.
    """
    if not is_configured():
        raise GmailOAuthError("Gmail OAuth isn't configured on this server.")
    try:
        resp = httpx.post(
            _TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "grant_type": "refresh_token",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Gmail token refresh failed: %s", exc)
        raise GmailOAuthError("Google rejected the refresh token — the connection needs to be redone.") from exc
    return _tokens_from_response(resp.json())


def fetch_account_email(access_token: str) -> str | None:
    """Look up the Google account email for display — never fails loudly.

    Purely cosmetic (labels the connection in the UI), so a failure here
    must not block the connect flow — the row is still created, just
    without ``external_account_email`` set.
    """
    try:
        resp = httpx.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json().get("email")
    except httpx.HTTPError as exc:
        logger.warning("Gmail userinfo lookup failed (non-fatal): %s", exc)
        return None


def revoke_token(token: str) -> None:
    """Best-effort revoke on disconnect — a failure here never blocks
    deleting our own stored copy, it only means Google keeps the grant
    listed on the user's 'connected apps' page until they revoke it there."""
    try:
        httpx.post(_REVOKE_URL, params={"token": token}, timeout=10.0)
    except httpx.HTTPError as exc:
        logger.warning("Gmail token revoke failed (non-fatal): %s", exc)


def send_email(*, access_token: str, from_address: str, to: str, subject: str, body: str) -> str:
    """Send one email via the Gmail API using a connected account's token.

    Returns the Gmail message id. Raises :class:`GmailOAuthError` on any
    failure — the caller (EmailProvider) is responsible for turning that
    into a ChannelResult rather than letting it propagate as a raw exception.
    """
    import base64
    from email.mime.text import MIMEText

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject or "(no subject)"
    msg["From"] = from_address
    msg["To"] = to
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

    try:
        resp = httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"raw": raw},
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Gmail send failed: %s", exc)
        raise GmailOAuthError(f"Gmail API rejected the send: {exc}") from exc
    return resp.json().get("id", "")
