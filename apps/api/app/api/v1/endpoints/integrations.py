"""Integrations — connect/disconnect third-party accounts per organization.

Two different kinds of "connected" live on the same page, and the response
is explicit about which is which (see IntegrationStatusOut.scope):

* **organization-scoped** (real OAuth, one row per org): Gmail, LinkedIn,
  Salesforce. Each org connects (or not) its own account via a genuine
  Connect/Disconnect button — see gmail_oauth.py/linkedin_oauth.py/
  salesforce_oauth.py and IntegrationsService. Salesforce's row is
  connect-only for now — see salesforce_oauth's module docstring for why
  actually syncing records isn't built yet.
* **server-scoped** (a single shared credential the whole deployment uses):
  Email/SMTP fallback, X — status reused as-is from
  OmnichannelGateway.get_channel_status(), read-only here. LinkedIn's
  server-wide LINKEDIN_ACCESS_TOKEN still exists as the OmnichannelGateway's
  fallback when no org has connected LinkedIn (see gateway.dispatch_approved),
  but isn't listed separately here — showing two "LinkedIn" rows with
  different meanings would confuse the one button that actually does
  something (Connect).

Each OAuth handshake spans three endpoints, same shape for every provider:
  1. GET /{provider}/authorize  — authenticated call from the dashboard;
     returns a consent URL carrying a signed, short-lived state token.
  2. GET /{provider}/callback   — the provider redirects the BROWSER here
     directly, so this endpoint carries none of our normal auth (no JWT, no
     X-API-Key — see API_KEY_EXEMPT_PATHS). It trusts only the signed state
     token.
  3. POST /{provider}/disconnect — authenticated; revokes (where the
     provider supports it) + deletes the row.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import settings
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.security import InvalidTokenError, create_oauth_state_token, decode_oauth_state_token
from app.models.base import UserRole
from app.models.user import User
from app.schemas.integrations import AuthorizeUrlOut, IntegrationStatusOut
from app.services.integrations import gmail_oauth, linkedin_oauth, salesforce_oauth
from app.services.integrations.gmail_oauth import GmailOAuthError
from app.services.integrations.linkedin_oauth import LinkedInOAuthError
from app.services.integrations.salesforce_oauth import SalesforceOAuthError
from app.services.integrations.service import IntegrationsService
from app.services.omnichannel.gateway import OmnichannelGateway

logger = get_logger(__name__)

router = APIRouter(prefix="/integrations", tags=["Integrations"])

_GMAIL_STATE_PURPOSE = "gmail_connect"
_LINKEDIN_STATE_PURPOSE = "linkedin_connect"
_SALESFORCE_STATE_PURPOSE = "salesforce_connect"

# Server-scoped channels are shown as-is except "linkedin", which now has
# its own organization-scoped row above (see module docstring).
_SERVER_CHANNEL_LABELS = {"email": "Email (SMTP)", "twitter": "X / Twitter"}


@router.get("", response_model=list[IntegrationStatusOut], summary="Status of every integration")
def list_integrations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[IntegrationStatusOut]:
    result: list[IntegrationStatusOut] = []
    integrations = IntegrationsService(session)

    gmail = integrations.get_connection(current_user.organization_id, "gmail")
    result.append(
        IntegrationStatusOut(
            provider="gmail",
            label="Gmail",
            connected=gmail is not None,
            scope="organization",
            account_email=gmail.external_account_email if gmail else None,
            connected_at=gmail.created_at if gmail else None,
            last_error=gmail.last_error if gmail else None,
            detail=None if gmail_oauth.is_configured() else "No configurado en el servidor todavía.",
        )
    )

    linkedin = integrations.get_connection(current_user.organization_id, "linkedin")
    result.append(
        IntegrationStatusOut(
            provider="linkedin",
            label="LinkedIn",
            connected=linkedin is not None,
            scope="organization",
            account_email=linkedin.external_account_email if linkedin else None,
            connected_at=linkedin.created_at if linkedin else None,
            last_error=linkedin.last_error if linkedin else None,
            detail=None if linkedin_oauth.is_configured() else "No configurado en el servidor todavía.",
        )
    )

    salesforce = integrations.get_connection(current_user.organization_id, "salesforce")
    result.append(
        IntegrationStatusOut(
            provider="salesforce",
            label="Salesforce",
            connected=salesforce is not None,
            scope="organization",
            account_email=salesforce.external_account_email if salesforce else None,
            connected_at=salesforce.created_at if salesforce else None,
            last_error=salesforce.last_error if salesforce else None,
            detail=(
                "Solo conecta la cuenta todavía — sincronizar registros es un siguiente paso."
                if salesforce
                else (None if salesforce_oauth.is_configured() else "No configurado en el servidor todavía.")
            ),
        )
    )

    for status_dict in OmnichannelGateway(session).get_channel_status():
        channel = status_dict.get("channel", "unknown")
        if channel == "linkedin":
            continue
        result.append(
            IntegrationStatusOut(
                provider=channel,
                label=_SERVER_CHANNEL_LABELS.get(channel, channel.title()),
                connected=bool(status_dict.get("authenticated")),
                scope="server",
                detail="Credencial compartida del servidor, no por cuenta." if status_dict.get("authenticated")
                else "Modo simulado — no hay credencial del servidor configurada.",
            )
        )

    return result


# ── Gmail ────────────────────────────────────────────────────────────────


@router.get(
    "/gmail/authorize",
    response_model=AuthorizeUrlOut,
    summary="Get the Google consent URL to connect this organization's Gmail",
)
def gmail_authorize(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> AuthorizeUrlOut:
    if not gmail_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gmail todavía no está configurado en el servidor (faltan las credenciales de Google Cloud).",
        )
    state = create_oauth_state_token(current_user.organization_id, purpose=_GMAIL_STATE_PURPOSE)
    return AuthorizeUrlOut(authorize_url=gmail_oauth.build_authorize_url(state))


@router.get(
    "/gmail/callback",
    summary="Google redirects here after the user grants (or denies) consent",
    include_in_schema=False,
)
def gmail_callback(
    session: Session = Depends(get_session),
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    redirect_base = f"{settings.FRONTEND_URL}/dashboard/integrations"

    if error:
        logger.info("Gmail OAuth denied by user: %s", error)
        return RedirectResponse(f"{redirect_base}?integration_error=denied")

    if not code or not state:
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_request")

    try:
        organization_id = decode_oauth_state_token(state, expected_purpose=_GMAIL_STATE_PURPOSE)
    except InvalidTokenError:
        logger.warning("Gmail OAuth callback with invalid/expired state token")
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_state")

    try:
        tokens = gmail_oauth.exchange_code_for_tokens(code)
        account_email = gmail_oauth.fetch_account_email(tokens.access_token)
    except GmailOAuthError as exc:
        logger.warning("Gmail OAuth exchange failed: %s", exc)
        return RedirectResponse(f"{redirect_base}?integration_error=exchange_failed")

    IntegrationsService(session).save_gmail_connection(
        organization_id=organization_id,
        connected_by_user_id=None,  # the callback carries no session — see module docstring
        tokens=tokens,
        account_email=account_email,
    )
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=gmail")


@router.post("/gmail/disconnect", summary="Disconnect this organization's Gmail account")
def gmail_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "gmail")
    session.commit()
    return {"disconnected": disconnected}


# ── LinkedIn ─────────────────────────────────────────────────────────────


@router.get(
    "/linkedin/authorize",
    response_model=AuthorizeUrlOut,
    summary="Get the LinkedIn consent URL to connect this organization's LinkedIn",
)
def linkedin_authorize(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> AuthorizeUrlOut:
    if not linkedin_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LinkedIn todavía no está configurado en el servidor (falta la app de LinkedIn Developers).",
        )
    state = create_oauth_state_token(current_user.organization_id, purpose=_LINKEDIN_STATE_PURPOSE)
    return AuthorizeUrlOut(authorize_url=linkedin_oauth.build_authorize_url(state))


@router.get(
    "/linkedin/callback",
    summary="LinkedIn redirects here after the user grants (or denies) consent",
    include_in_schema=False,
)
def linkedin_callback(
    session: Session = Depends(get_session),
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    redirect_base = f"{settings.FRONTEND_URL}/dashboard/integrations"

    if error:
        logger.info("LinkedIn OAuth denied by user: %s", error)
        return RedirectResponse(f"{redirect_base}?integration_error=denied")

    if not code or not state:
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_request")

    try:
        organization_id = decode_oauth_state_token(state, expected_purpose=_LINKEDIN_STATE_PURPOSE)
    except InvalidTokenError:
        logger.warning("LinkedIn OAuth callback with invalid/expired state token")
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_state")

    try:
        tokens = linkedin_oauth.exchange_code_for_tokens(code)
        account_label = linkedin_oauth.fetch_account_info(tokens.access_token)
    except LinkedInOAuthError as exc:
        logger.warning("LinkedIn OAuth exchange failed: %s", exc)
        return RedirectResponse(f"{redirect_base}?integration_error=exchange_failed")

    IntegrationsService(session).save_linkedin_connection(
        organization_id=organization_id,
        connected_by_user_id=None,  # the callback carries no session — see module docstring
        tokens=tokens,
        account_label=account_label,
    )
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=linkedin")


@router.post("/linkedin/disconnect", summary="Disconnect this organization's LinkedIn account")
def linkedin_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "linkedin")
    session.commit()
    return {"disconnected": disconnected}


# ── Salesforce ───────────────────────────────────────────────────────────


@router.get(
    "/salesforce/authorize",
    response_model=AuthorizeUrlOut,
    summary="Get the Salesforce consent URL to connect this organization's Salesforce org",
)
def salesforce_authorize(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> AuthorizeUrlOut:
    if not salesforce_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Salesforce todavía no está configurado en el servidor (falta la Connected App).",
        )
    state = create_oauth_state_token(current_user.organization_id, purpose=_SALESFORCE_STATE_PURPOSE)
    return AuthorizeUrlOut(authorize_url=salesforce_oauth.build_authorize_url(state))


@router.get(
    "/salesforce/callback",
    summary="Salesforce redirects here after the user grants (or denies) consent",
    include_in_schema=False,
)
def salesforce_callback(
    session: Session = Depends(get_session),
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    redirect_base = f"{settings.FRONTEND_URL}/dashboard/integrations"

    if error:
        logger.info("Salesforce OAuth denied by user: %s", error)
        return RedirectResponse(f"{redirect_base}?integration_error=denied")

    if not code or not state:
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_request")

    try:
        organization_id = decode_oauth_state_token(state, expected_purpose=_SALESFORCE_STATE_PURPOSE)
    except InvalidTokenError:
        logger.warning("Salesforce OAuth callback with invalid/expired state token")
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_state")

    try:
        tokens = salesforce_oauth.exchange_code_for_tokens(code)
    except SalesforceOAuthError as exc:
        logger.warning("Salesforce OAuth exchange failed: %s", exc)
        return RedirectResponse(f"{redirect_base}?integration_error=exchange_failed")

    IntegrationsService(session).save_salesforce_connection(
        organization_id=organization_id,
        connected_by_user_id=None,  # the callback carries no session — see module docstring
        tokens=tokens,
    )
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=salesforce")


@router.post("/salesforce/disconnect", summary="Disconnect this organization's Salesforce org")
def salesforce_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "salesforce")
    session.commit()
    return {"disconnected": disconnected}
