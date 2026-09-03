"""Enterprise SSO — the two endpoints a browser actually talks to.

POST /auth/sso/lookup: pre-login discovery. A person types their work
email at /login; the frontend calls this before ever showing a password
field, and gets back either an authorize_url to redirect to, or
sso_available=false meaning "show the normal password form instead".

GET /auth/sso/callback: WorkOS redirects here after the person
authenticates with their IdP. Exchanges the one-time code for a profile,
matches it to an existing BEE user by (organization, email), issues a
normal session JWT, and redirects back to the frontend — same shape every
other OAuth callback in app.api.v1.endpoints.integrations uses
(RedirectResponse to FRONTEND_URL with a query/fragment param), except the
token rides in the URL *fragment* (`#sso_token=...`), not a query
param: a fragment is never sent to the server in a follow-up request and
never appears in a server access log, unlike notifications_stream's
`?token=` (which has no such alternative — see that endpoint's own
docstring for why it had no other option). A redirect is the one place in
this codebase's SSO flow that can afford to make that choice.

No self-serve account creation on either endpoint — see app.services.sso's
module docstring for why.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

from app.core.config import settings
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.security import create_access_token
from app.models.organization import Organization
from app.models.user import User
from app.schemas.sso import SSOLookupIn, SSOLookupOut
from app.services.sso import SSOError, exchange_code_for_profile, get_authorization_url

logger = get_logger(__name__)

router = APIRouter(prefix="/auth/sso", tags=["Enterprise SSO"])


@router.post("/lookup", response_model=SSOLookupOut, summary="Check whether an email's org has SSO enabled")
def lookup_sso(data: SSOLookupIn, session: Session = Depends(get_session)) -> SSOLookupOut:
    domain = data.email.split("@")[-1].lower()
    org = session.exec(
        select(Organization).where(
            Organization.sso_domain == domain,
            Organization.sso_enabled.is_(True),  # type: ignore[attr-defined]
        )
    ).first()
    if org is None:
        return SSOLookupOut(sso_available=False)

    try:
        authorize_url = get_authorization_url(org)
    except SSOError as exc:
        # sso_enabled + sso_domain are set but either the connection_id or
        # the global WORKOS_* settings aren't — treat exactly like "not
        # available" rather than surfacing a 500 to someone typing their
        # email at the login screen.
        logger.info("SSO lookup for domain=%s matched an org but isn't fully configured: %s", domain, exc)
        return SSOLookupOut(sso_available=False)

    return SSOLookupOut(sso_available=True, authorize_url=authorize_url)


@router.get(
    "/callback",
    include_in_schema=False,  # redirect-only, like the OAuth callbacks in endpoints.integrations
    summary="WorkOS SSO callback",
)
def sso_callback(
    code: str = Query(...),
    session: Session = Depends(get_session),
) -> RedirectResponse:
    redirect_base = f"{settings.FRONTEND_URL}/login"
    try:
        profile = exchange_code_for_profile(code)
    except SSOError as exc:
        logger.warning("SSO callback: code exchange failed: %s", exc)
        return RedirectResponse(f"{redirect_base}?sso_error=exchange_failed")

    org = session.exec(
        select(Organization).where(Organization.sso_connection_id == profile.connection_id)
    ).first()
    if org is None or not org.sso_enabled:
        logger.warning("SSO callback: no enabled organization matches connection_id=%s", profile.connection_id)
        return RedirectResponse(f"{redirect_base}?sso_error=unknown_connection")

    user = session.exec(
        select(User).where(
            User.organization_id == org.id,
            User.email == profile.email,
            User.is_active.is_(True),  # type: ignore[attr-defined]
        )
    ).first()
    if user is None:
        # Deliberately not auto-provisioned — see app.services.sso's module
        # docstring. An existing OWNER/ADMIN invites the person first
        # (POST /users), same as every non-SSO account in this codebase.
        logger.info("SSO callback: no active BEE account for %s in org %s", profile.email, org.id)
        return RedirectResponse(f"{redirect_base}?sso_error=no_account")

    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return RedirectResponse(f"{redirect_base}#sso_token={token}")
