"""IntegrationsService — DB-facing orchestration for connected accounts.

Owns reading/writing IntegrationConnection rows (encrypting/decrypting
tokens at the boundary) and deciding when a stored access token needs a
refresh before use. Provider-specific OAuth mechanics live in
gmail_oauth.py/linkedin_oauth.py/salesforce_oauth.py; this module never
talks to a provider directly except through those.

The public API is one pair of methods per provider (save_X_connection /
get_valid_X_access_token) rather than one generic "save_connection(provider,
...)" — each provider already differs in what "revoke", "refresh", and
"the token" mean (see each *_oauth.py module's docstring: LinkedIn has no
revoke endpoint, Salesforce's token comes with an instance_url the caller
needs too). The shared upsert/refresh-if-expiring mechanics that ARE
identical live in the two private `_save_connection`/`_get_valid_connection`
helpers below; each public method is a thin, provider-specific wrapper that
extracts what it needs from the row `_get_valid_connection` hands back.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.core.token_crypto import TokenDecryptionError, decrypt_token, encrypt_token
from app.models.integration_connection import IntegrationConnection
from app.services.integrations import gmail_oauth, linkedin_oauth, salesforce_oauth
from app.services.integrations.gmail_oauth import GmailOAuthError, GmailTokens
from app.services.integrations.linkedin_oauth import LinkedInOAuthError, LinkedInTokens
from app.services.integrations.salesforce_oauth import SalesforceOAuthError, SalesforceTokens

logger = get_logger(__name__)

# Refresh a bit before actual expiry so a send never races a token that
# expires mid-request.
_REFRESH_SKEW = timedelta(minutes=2)

_OAuthTokens = GmailTokens | LinkedInTokens | SalesforceTokens


class IntegrationsService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Reads ────────────────────────────────────────────────────────────

    def get_connection(self, organization_id: uuid.UUID, provider: str) -> IntegrationConnection | None:
        return self.session.exec(
            select(IntegrationConnection).where(
                IntegrationConnection.organization_id == organization_id,
                IntegrationConnection.provider == provider,
            )
        ).first()

    # ── Writes ───────────────────────────────────────────────────────────

    def _save_connection(
        self,
        *,
        provider: str,
        organization_id: uuid.UUID,
        connected_by_user_id: uuid.UUID | None,
        tokens: _OAuthTokens,
        account_label: str | None,
    ) -> IntegrationConnection:
        """Create or replace this org's connection for ``provider`` (upsert
        by (organization_id, provider) — reconnecting simply overwrites)."""
        existing = self.get_connection(organization_id, provider)
        refresh_token = tokens.refresh_token
        if existing and not refresh_token:
            # None of Google/LinkedIn/Salesforce reliably re-issues a
            # refresh_token on every consent — a reconnect that didn't get
            # a new one keeps using the previously stored one rather than
            # losing refresh ability entirely.
            try:
                refresh_token = (
                    decrypt_token(existing.refresh_token_encrypted) if existing.refresh_token_encrypted else None
                )
            except TokenDecryptionError:
                refresh_token = None

        row = existing or IntegrationConnection(organization_id=organization_id, provider=provider)
        row.connected_by_user_id = connected_by_user_id
        row.external_account_email = account_label
        row.access_token_encrypted = encrypt_token(tokens.access_token)
        row.refresh_token_encrypted = encrypt_token(refresh_token) if refresh_token else None
        row.token_expires_at = tokens.expires_at
        row.scopes = tokens.scope
        row.instance_url = getattr(tokens, "instance_url", None)
        row.last_error = None
        row.updated_at = datetime.now(UTC)

        self.session.add(row)
        self.session.flush()
        self.session.refresh(row)
        return row

    def save_gmail_connection(
        self,
        *,
        organization_id: uuid.UUID,
        connected_by_user_id: uuid.UUID | None,
        tokens: GmailTokens,
        account_email: str | None,
    ) -> IntegrationConnection:
        return self._save_connection(
            provider="gmail",
            organization_id=organization_id,
            connected_by_user_id=connected_by_user_id,
            tokens=tokens,
            account_label=account_email,
        )

    def save_linkedin_connection(
        self,
        *,
        organization_id: uuid.UUID,
        connected_by_user_id: uuid.UUID | None,
        tokens: LinkedInTokens,
        account_label: str | None,
    ) -> IntegrationConnection:
        return self._save_connection(
            provider="linkedin",
            organization_id=organization_id,
            connected_by_user_id=connected_by_user_id,
            tokens=tokens,
            account_label=account_label,
        )

    def save_salesforce_connection(
        self,
        *,
        organization_id: uuid.UUID,
        connected_by_user_id: uuid.UUID | None,
        tokens: SalesforceTokens,
    ) -> IntegrationConnection:
        return self._save_connection(
            provider="salesforce",
            organization_id=organization_id,
            connected_by_user_id=connected_by_user_id,
            tokens=tokens,
            account_label=salesforce_oauth.org_label(tokens.instance_url),
        )

    def disconnect(self, organization_id: uuid.UUID, provider: str) -> bool:
        """Best-effort revoke with the provider (Gmail only — LinkedIn and
        Salesforce have no public revoke-by-API-call step BEE uses here),
        then delete our copy unconditionally — a failed revoke call must
        never leave a "disconnect" button that appears to do nothing."""
        row = self.get_connection(organization_id, provider)
        if not row:
            return False

        if provider == "gmail":
            try:
                access_token = decrypt_token(row.access_token_encrypted)
                gmail_oauth.revoke_token(access_token)
            except (TokenDecryptionError, GmailOAuthError) as exc:
                logger.warning("Gmail revoke on disconnect failed (non-fatal): %s", exc)

        self.session.delete(row)
        self.session.flush()
        return True

    # ── Token access for actual sends ──────────────────────────────────────

    def _get_valid_connection(
        self,
        provider: str,
        organization_id: uuid.UUID,
        refresh_fn: Callable[[str], _OAuthTokens],
        refresh_error: type[Exception],
    ) -> tuple[str, IntegrationConnection] | None:
        """Return ``(access_token, row)`` for this org's connected account
        on ``provider``, refreshing first if near expiry. Each public
        get_valid_X_access_token wrapper extracts whatever it needs from
        ``row`` (an email address, an instance_url, ...).

        Returns ``None`` when there's no connection, or when refresh fails
        (also records the failure on the row as ``last_error`` so the
        Integrations page can show "reconectar" instead of the connection
        silently going quiet).
        """
        row = self.get_connection(organization_id, provider)
        if not row:
            return None

        try:
            access_token = decrypt_token(row.access_token_encrypted)
        except TokenDecryptionError:
            row.last_error = "No se pudo leer el token guardado — reconecta la cuenta."
            self.session.add(row)
            self.session.flush()
            return None

        expires_at = row.token_expires_at
        # SQLite (tests) round-trips datetimes as naive, dropping tzinfo even
        # though we always write UTC-aware ones — reattach UTC rather than
        # let the comparison below raise on a real Postgres-vs-SQLite
        # behavior difference.
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        needs_refresh = expires_at is None or datetime.now(UTC) >= (expires_at - _REFRESH_SKEW)
        if needs_refresh:
            if not row.refresh_token_encrypted:
                row.last_error = "La conexión expiró y no hay token de actualización — reconecta la cuenta."
                self.session.add(row)
                self.session.flush()
                return None
            try:
                refresh_token = decrypt_token(row.refresh_token_encrypted)
                fresh = refresh_fn(refresh_token)
            except (TokenDecryptionError, refresh_error) as exc:
                row.last_error = str(exc)
                self.session.add(row)
                self.session.flush()
                return None

            access_token = fresh.access_token
            row.access_token_encrypted = encrypt_token(fresh.access_token)
            row.token_expires_at = fresh.expires_at
            instance_url = getattr(fresh, "instance_url", None)
            if instance_url:
                row.instance_url = instance_url
            row.last_error = None
            self.session.add(row)
            self.session.flush()

        return access_token, row

    def get_valid_gmail_access_token(self, organization_id: uuid.UUID) -> tuple[str, str] | None:
        """Returns ``(access_token, from_address)``."""
        result = self._get_valid_connection("gmail", organization_id, gmail_oauth.refresh_access_token, GmailOAuthError)
        if not result:
            return None
        access_token, row = result
        if not row.external_account_email:
            return None
        return access_token, row.external_account_email

    def get_valid_linkedin_access_token(self, organization_id: uuid.UUID) -> tuple[str, str] | None:
        """Returns ``(access_token, account_label)``."""
        result = self._get_valid_connection(
            "linkedin", organization_id, linkedin_oauth.refresh_access_token, LinkedInOAuthError
        )
        if not result:
            return None
        access_token, row = result
        if not row.external_account_email:
            return None
        return access_token, row.external_account_email

    def get_valid_salesforce_access_token(self, organization_id: uuid.UUID) -> tuple[str, str] | None:
        """Returns ``(access_token, instance_url)`` — every Salesforce API
        call must target ``instance_url``, not a fixed host."""
        result = self._get_valid_connection(
            "salesforce", organization_id, salesforce_oauth.refresh_access_token, SalesforceOAuthError
        )
        if not result:
            return None
        access_token, row = result
        if not row.instance_url:
            return None
        return access_token, row.instance_url
