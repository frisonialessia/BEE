"""Enterprise SSO — WorkOS SSO handshake (authorize URL + code exchange).

BEE never talks to a customer's IdP (Okta, Azure AD, Google Workspace, a
raw SAML metadata file, ...) directly — WorkOS normalizes SAML *and* OIDC
behind one OAuth2-shaped authorize/token exchange, the same "use a
specialist instead of reimplementing a hard, security-sensitive protocol
ourselves" reasoning this codebase already applies to Stripe for payments
and AWS Secrets Manager for secrets.

Two independent gates, both open, before this does anything:
1. Global: WORKOS_API_KEY / WORKOS_CLIENT_ID / WORKOS_REDIRECT_URI set
   (see app.core.config) — BEE-team-wide, "has a WorkOS account at all".
2. Per-organization: Organization.sso_enabled + sso_connection_id set (see
   app.models.organization) — "this specific customer's IdP connection is
   provisioned and turned on".

Either gate closed means SSO is simply unavailable for that request — see
is_globally_configured()/get_authorization_url() below. This mirrors every
other opt-in integration in this codebase (Sentry, OTEL, PostHog): unset
is inert, not an error state a deployment has to actively avoid.

Deliberately does NOT auto-provision a user on first SSO login — see
app.api.v1.endpoints.sso's callback handler. There is no public "create an
organization" surface today either (app.services.auth's own docstring);
someone landing via SSO with no existing BEE account is told to ask their
admin, the same way a public API key with no matching user would be.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.models.organization import Organization

logger = get_logger(__name__)

AUTHORIZE_URL = "https://api.workos.com/sso/authorize"
TOKEN_URL = "https://api.workos.com/sso/token"


class SSOError(Exception):
    """Raised whenever SSO is unavailable or WorkOS rejects a step of the
    handshake — callers turn this into an HTTP redirect with an error
    query param, never a raw 500."""


@dataclass
class SSOProfile:
    """The subset of WorkOS's Profile object BEE actually needs to match a
    login attempt to an existing User — see WorkOS's own docs for the full
    shape (it also carries first_name/last_name/idp_id/raw_attributes,
    none of which BEE persists anywhere)."""

    email: str
    connection_id: str


def is_globally_configured() -> bool:
    """True once the BEE team has a real WorkOS account wired up. Does NOT
    say anything about whether any particular organization has SSO turned
    on — see get_authorization_url() for the per-org gate."""
    return bool(settings.WORKOS_API_KEY and settings.WORKOS_CLIENT_ID and settings.WORKOS_REDIRECT_URI)


def get_authorization_url(organization: Organization) -> str:
    """Build the URL to send a browser to start this organization's SSO
    login. Raises SSOError if either gate described in this module's
    docstring is closed — callers are expected to check
    ``organization.sso_enabled`` themselves first for a cleaner error
    message, but this re-checks defensively rather than trusting them to.
    """
    if not is_globally_configured():
        raise SSOError("SSO isn't configured on this server (WORKOS_* settings are unset).")
    if not organization.sso_enabled or not organization.sso_connection_id:
        raise SSOError(f"SSO isn't enabled for organization {organization.id}.")

    params = {
        "client_id": settings.WORKOS_CLIENT_ID,
        "redirect_uri": settings.WORKOS_REDIRECT_URI,
        "response_type": "code",
        "connection": organization.sso_connection_id,
    }
    return f"{AUTHORIZE_URL}?{httpx.QueryParams(params)}"


def _profile_from_response(data: dict[str, Any]) -> SSOProfile:
    profile = data.get("profile", {})
    email = profile.get("email")
    connection_id = profile.get("connection_id")
    if not email or not connection_id:
        raise SSOError("WorkOS returned a profile missing email or connection_id.")
    return SSOProfile(email=email.lower(), connection_id=connection_id)


def exchange_code_for_profile(code: str) -> SSOProfile:
    """Redeem the one-time ``code`` WorkOS appended to the callback
    redirect for the authenticated person's profile. Raises SSOError on
    any failure — an expired/already-used code, a WorkOS-side error, or a
    malformed response — never lets an httpx exception escape to the
    endpoint layer."""
    if not is_globally_configured():
        raise SSOError("SSO isn't configured on this server.")
    try:
        resp = httpx.post(
            TOKEN_URL,
            data={
                "client_id": settings.WORKOS_CLIENT_ID,
                "client_secret": settings.WORKOS_API_KEY,
                "grant_type": "authorization_code",
                "code": code,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("WorkOS SSO code exchange failed: %s", exc)
        raise SSOError("WorkOS rejected the SSO authorization code.") from exc
    return _profile_from_response(resp.json())
