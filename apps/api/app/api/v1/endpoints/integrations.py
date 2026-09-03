"""Integrations — connect/disconnect third-party accounts per organization.

Two different kinds of "connected" live on the same page, and the response
is explicit about which is which (see IntegrationStatusOut.scope):

* **organization-scoped** (real OAuth, one row per org): Gmail, LinkedIn,
  Salesforce, HubSpot, Jira. Each org connects (or not) its own account via
  a genuine Connect/Disconnect button — see gmail_oauth.py/linkedin_oauth.py/
  salesforce_oauth.py/hubspot_oauth.py/jira_oauth.py and IntegrationsService.
  Salesforce and HubSpot additionally get POST /salesforce/import and
  POST /hubspot/import — a one-way, explicit, re-runnable pull of each
  CRM's standard objects into BEE's own Company/Lead/Opportunity tables
  (see salesforce_import.py's/hubspot_import.py's module docstrings for why
  it's one-way and standard-fields-only). Jira runs the other direction —
  BEE pushes OUT: PATCH /jira/config sets a target project, then
  JiraSyncHandler (app.services.workflow_orchestrator.handlers) creates a
  Jira issue when an opportunity reaches Ready to action and comments on
  it when the deal closes — see that handler's own docstring.
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

import uuid

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
from app.schemas.integrations import (
    AuthorizeUrlOut,
    HubSpotImportSummaryOut,
    IntegrationStatusOut,
    JiraConfigIn,
    SalesforceImportSummaryOut,
)
from app.services.admin_audit import AdminAuditService
from app.services.integrations import (
    gmail_oauth,
    hubspot_oauth,
    jira_oauth,
    linkedin_oauth,
    salesforce_oauth,
)
from app.services.integrations.gmail_oauth import GmailOAuthError
from app.services.integrations.hubspot_import import HubSpotImportService
from app.services.integrations.hubspot_oauth import HubSpotOAuthError
from app.services.integrations.jira_oauth import JiraOAuthError
from app.services.integrations.linkedin_oauth import LinkedInOAuthError
from app.services.integrations.salesforce_import import SalesforceImportService
from app.services.integrations.salesforce_oauth import SalesforceOAuthError
from app.services.integrations.service import IntegrationsService
from app.services.omnichannel.gateway import OmnichannelGateway

logger = get_logger(__name__)

router = APIRouter(prefix="/integrations", tags=["Integrations"])

_GMAIL_STATE_PURPOSE = "gmail_connect"
_LINKEDIN_STATE_PURPOSE = "linkedin_connect"
_SALESFORCE_STATE_PURPOSE = "salesforce_connect"
_HUBSPOT_STATE_PURPOSE = "hubspot_connect"
_JIRA_STATE_PURPOSE = "jira_connect"

# Server-scoped channels are shown as-is except "linkedin", which now has
# its own organization-scoped row above (see module docstring).
_SERVER_CHANNEL_LABELS = {"email": "Email (SMTP)", "twitter": "X / Twitter"}
_SERVER_CHANNEL_CATEGORIES = {"email": "email", "twitter": "social"}


def _audit_connected(session: Session, *, organization_id: uuid.UUID, provider: str) -> None:
    """Every *_callback below calls this right after save_X_connection —
    actor_user_id is always None here (see each callback's own comment on
    why: the OAuth redirect carries no session), still worth recording
    when/which org connected which provider even without who."""
    AdminAuditService(session).log(
        organization_id=organization_id,
        actor_user_id=None,
        action="integration.connected",
        summary=f"{provider.capitalize()} connected.",
        entity_type="integration_connection",
        detail={"provider": provider},
    )


def _audit_disconnected(session: Session, *, current_user: User, provider: str) -> None:
    AdminAuditService(session).log(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        action="integration.disconnected",
        summary=f"{current_user.email} disconnected {provider.capitalize()}.",
        entity_type="integration_connection",
        detail={"provider": provider},
    )


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
            category="email",
            account_email=gmail.external_account_email if gmail else None,
            connected_at=gmail.created_at if gmail else None,
            last_error=gmail.last_error if gmail else None,
            detail=None if gmail_oauth.is_configured() else "No configurado en el servidor todavía.",
            detail_code=None if gmail_oauth.is_configured() else "not_configured",
        )
    )

    linkedin = integrations.get_connection(current_user.organization_id, "linkedin")
    result.append(
        IntegrationStatusOut(
            provider="linkedin",
            label="LinkedIn",
            connected=linkedin is not None,
            scope="organization",
            category="social",
            account_email=linkedin.external_account_email if linkedin else None,
            connected_at=linkedin.created_at if linkedin else None,
            last_error=linkedin.last_error if linkedin else None,
            detail=None if linkedin_oauth.is_configured() else "No configurado en el servidor todavía.",
            detail_code=None if linkedin_oauth.is_configured() else "not_configured",
        )
    )

    salesforce = integrations.get_connection(current_user.organization_id, "salesforce")
    result.append(
        IntegrationStatusOut(
            provider="salesforce",
            label="Salesforce",
            connected=salesforce is not None,
            scope="organization",
            category="crm",
            account_email=salesforce.external_account_email if salesforce else None,
            connected_at=salesforce.created_at if salesforce else None,
            last_error=salesforce.last_error if salesforce else None,
            detail=(
                "Importa Accounts/Contacts/Leads/Opportunities cuando quieras — solo lectura, nunca escribe en Salesforce."
                if salesforce
                else (None if salesforce_oauth.is_configured() else "No configurado en el servidor todavía.")
            ),
            detail_code=(
                "crm_import_readonly"
                if salesforce
                else (None if salesforce_oauth.is_configured() else "not_configured")
            ),
            detail_params={"objects": "Accounts/Contacts/Leads/Opportunities", "provider": "Salesforce"},
        )
    )

    hubspot = integrations.get_connection(current_user.organization_id, "hubspot")
    result.append(
        IntegrationStatusOut(
            provider="hubspot",
            label="HubSpot",
            connected=hubspot is not None,
            scope="organization",
            category="crm",
            account_email=hubspot.external_account_email if hubspot else None,
            connected_at=hubspot.created_at if hubspot else None,
            last_error=hubspot.last_error if hubspot else None,
            detail=(
                "Importa Companies/Contacts/Deals cuando quieras — solo lectura, nunca escribe en HubSpot."
                if hubspot
                else (None if hubspot_oauth.is_configured() else "No configurado en el servidor todavía.")
            ),
            detail_code=(
                "crm_import_readonly" if hubspot else (None if hubspot_oauth.is_configured() else "not_configured")
            ),
            detail_params={"objects": "Companies/Contacts/Deals", "provider": "HubSpot"},
        )
    )

    jira = integrations.get_connection(current_user.organization_id, "jira")
    jira_project_key = jira.config.get("project_key") if jira else None
    result.append(
        IntegrationStatusOut(
            provider="jira",
            label="Jira",
            connected=jira is not None,
            scope="organization",
            category="pm",
            account_email=jira.external_account_email if jira else None,
            connected_at=jira.created_at if jira else None,
            last_error=jira.last_error if jira else None,
            detail=(
                f"Sincroniza oportunidades con el proyecto {jira_project_key} — crea un issue al llegar a "
                "Ready to action, comenta al ganar/perder."
                if jira and jira_project_key
                else "Conectado — falta configurar un proyecto de Jira para activar la sincronización."
                if jira
                else (None if jira_oauth.is_configured() else "No configurado en el servidor todavía.")
            ),
            detail_code=(
                "jira_synced"
                if jira and jira_project_key
                else "jira_project_missing"
                if jira
                else (None if jira_oauth.is_configured() else "not_configured")
            ),
            detail_params={"project": jira_project_key} if jira_project_key else {},
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
                category=_SERVER_CHANNEL_CATEGORIES.get(channel),
                detail="Credencial compartida del servidor, no por cuenta." if status_dict.get("authenticated")
                else "Modo simulado — no hay credencial del servidor configurada.",
                detail_code="server_shared_credential" if status_dict.get("authenticated") else "server_mock_mode",
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
    _audit_connected(session, organization_id=organization_id, provider="gmail")
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=gmail")


@router.post("/gmail/disconnect", summary="Disconnect this organization's Gmail account")
def gmail_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "gmail")
    if disconnected:
        _audit_disconnected(session, current_user=current_user, provider="gmail")
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
    _audit_connected(session, organization_id=organization_id, provider="linkedin")
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=linkedin")


@router.post("/linkedin/disconnect", summary="Disconnect this organization's LinkedIn account")
def linkedin_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "linkedin")
    if disconnected:
        _audit_disconnected(session, current_user=current_user, provider="linkedin")
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
    _audit_connected(session, organization_id=organization_id, provider="salesforce")
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=salesforce")


@router.post("/salesforce/disconnect", summary="Disconnect this organization's Salesforce org")
def salesforce_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "salesforce")
    if disconnected:
        _audit_disconnected(session, current_user=current_user, provider="salesforce")
    session.commit()
    return {"disconnected": disconnected}


@router.post(
    "/salesforce/import",
    response_model=SalesforceImportSummaryOut,
    summary="Pull Accounts/Contacts/Leads/Opportunities from Salesforce into BEE",
)
def salesforce_import(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> SalesforceImportSummaryOut:
    """One-way pull, safe to re-run — see salesforce_import.py's module
    docstring. Requires an active Salesforce connection; 400s with a clear
    message otherwise rather than a confusing empty result."""
    connection = IntegrationsService(session).get_valid_salesforce_access_token(current_user.organization_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conecta Salesforce primero desde Integraciones.",
        )
    access_token, instance_url = connection

    importer = SalesforceImportService(session, access_token=access_token, instance_url=instance_url)
    summary = importer.import_all(current_user.organization_id)
    session.commit()
    return SalesforceImportSummaryOut.model_validate(summary, from_attributes=True)


# ── HubSpot ──────────────────────────────────────────────────────────────


@router.get(
    "/hubspot/authorize",
    response_model=AuthorizeUrlOut,
    summary="Get the HubSpot consent URL to connect this organization's HubSpot account",
)
def hubspot_authorize(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> AuthorizeUrlOut:
    if not hubspot_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="HubSpot todavía no está configurado en el servidor (falta la app registrada).",
        )
    state = create_oauth_state_token(current_user.organization_id, purpose=_HUBSPOT_STATE_PURPOSE)
    return AuthorizeUrlOut(authorize_url=hubspot_oauth.build_authorize_url(state))


@router.get(
    "/hubspot/callback",
    summary="HubSpot redirects here after the user grants (or denies) consent",
    include_in_schema=False,
)
def hubspot_callback(
    session: Session = Depends(get_session),
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    redirect_base = f"{settings.FRONTEND_URL}/dashboard/integrations"

    if error:
        logger.info("HubSpot OAuth denied by user: %s", error)
        return RedirectResponse(f"{redirect_base}?integration_error=denied")

    if not code or not state:
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_request")

    try:
        organization_id = decode_oauth_state_token(state, expected_purpose=_HUBSPOT_STATE_PURPOSE)
    except InvalidTokenError:
        logger.warning("HubSpot OAuth callback with invalid/expired state token")
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_state")

    try:
        tokens = hubspot_oauth.exchange_code_for_tokens(code)
        account_label = hubspot_oauth.fetch_account_label(tokens.access_token)
    except HubSpotOAuthError as exc:
        logger.warning("HubSpot OAuth exchange failed: %s", exc)
        return RedirectResponse(f"{redirect_base}?integration_error=exchange_failed")

    IntegrationsService(session).save_hubspot_connection(
        organization_id=organization_id,
        connected_by_user_id=None,  # the callback carries no session — see module docstring
        tokens=tokens,
        account_label=account_label,
    )
    _audit_connected(session, organization_id=organization_id, provider="hubspot")
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=hubspot")


@router.post("/hubspot/disconnect", summary="Disconnect this organization's HubSpot account")
def hubspot_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "hubspot")
    if disconnected:
        _audit_disconnected(session, current_user=current_user, provider="hubspot")
    session.commit()
    return {"disconnected": disconnected}


@router.post(
    "/hubspot/import",
    response_model=HubSpotImportSummaryOut,
    summary="Pull Companies/Contacts/Deals from HubSpot into BEE",
)
def hubspot_import(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> HubSpotImportSummaryOut:
    """One-way pull, safe to re-run — see hubspot_import.py's module
    docstring. Requires an active HubSpot connection; 400s with a clear
    message otherwise rather than a confusing empty result."""
    access_token = IntegrationsService(session).get_valid_hubspot_access_token(current_user.organization_id)
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conecta HubSpot primero desde Integraciones.",
        )

    importer = HubSpotImportService(session, access_token=access_token)
    summary = importer.import_all(current_user.organization_id)
    session.commit()
    return HubSpotImportSummaryOut.model_validate(summary, from_attributes=True)


# ── Jira ─────────────────────────────────────────────────────────────────


@router.get(
    "/jira/authorize",
    response_model=AuthorizeUrlOut,
    summary="Get the Atlassian consent URL to connect this organization's Jira",
)
def jira_authorize(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> AuthorizeUrlOut:
    if not jira_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Jira todavía no está configurado en el servidor (falta la app registrada).",
        )
    state = create_oauth_state_token(current_user.organization_id, purpose=_JIRA_STATE_PURPOSE)
    return AuthorizeUrlOut(authorize_url=jira_oauth.build_authorize_url(state))


@router.get(
    "/jira/callback",
    summary="Atlassian redirects here after the user grants (or denies) consent",
    include_in_schema=False,
)
def jira_callback(
    session: Session = Depends(get_session),
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    redirect_base = f"{settings.FRONTEND_URL}/dashboard/integrations"

    if error:
        logger.info("Jira OAuth denied by user: %s", error)
        return RedirectResponse(f"{redirect_base}?integration_error=denied")

    if not code or not state:
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_request")

    try:
        organization_id = decode_oauth_state_token(state, expected_purpose=_JIRA_STATE_PURPOSE)
    except InvalidTokenError:
        logger.warning("Jira OAuth callback with invalid/expired state token")
        return RedirectResponse(f"{redirect_base}?integration_error=invalid_state")

    try:
        tokens = jira_oauth.exchange_code_for_tokens(code)
    except JiraOAuthError as exc:
        logger.warning("Jira OAuth exchange failed: %s", exc)
        return RedirectResponse(f"{redirect_base}?integration_error=exchange_failed")

    IntegrationsService(session).save_jira_connection(
        organization_id=organization_id,
        connected_by_user_id=None,  # the callback carries no session — see module docstring
        tokens=tokens,
    )
    _audit_connected(session, organization_id=organization_id, provider="jira")
    session.commit()

    return RedirectResponse(f"{redirect_base}?connected=jira")


@router.post("/jira/disconnect", summary="Disconnect this organization's Jira account")
def jira_disconnect(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    disconnected = IntegrationsService(session).disconnect(current_user.organization_id, "jira")
    if disconnected:
        _audit_disconnected(session, current_user=current_user, provider="jira")
    session.commit()
    return {"disconnected": disconnected}


@router.patch(
    "/jira/config",
    response_model=IntegrationStatusOut,
    summary="Set the Jira project opportunity-stage sync creates issues in",
)
def jira_set_config(
    body: JiraConfigIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> IntegrationStatusOut:
    """JiraSyncHandler (app.services.workflow_orchestrator.handlers) runs
    in mock mode until this is set — connecting alone isn't enough, since
    BEE has no way to guess which of an org's Jira projects should
    receive opportunity issues."""
    service = IntegrationsService(session)
    row = service.set_jira_project_key(current_user.organization_id, body.project_key)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conecta Jira primero desde Integraciones.",
        )
    session.commit()
    return IntegrationStatusOut(
        provider="jira",
        label="Jira",
        connected=True,
        scope="organization",
        category="pm",
        account_email=row.external_account_email,
        connected_at=row.created_at,
        last_error=row.last_error,
        detail=f"Sincroniza oportunidades con el proyecto {body.project_key}.",
    )
