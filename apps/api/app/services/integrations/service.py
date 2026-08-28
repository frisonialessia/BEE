"""IntegrationsService — DB-facing orchestration for connected accounts.

Owns reading/writing IntegrationConnection rows (encrypting/decrypting
tokens at the boundary) and deciding when a stored Gmail access token needs
a refresh before use. Provider-specific OAuth mechanics live in
gmail_oauth.py; this module never talks to Google directly except through
that module.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.core.token_crypto import TokenDecryptionError, decrypt_token, encrypt_token
from app.models.integration_connection import IntegrationConnection
from app.services.integrations import gmail_oauth
from app.services.integrations.gmail_oauth import GmailOAuthError, GmailTokens

logger = get_logger(__name__)

# Refresh a bit before actual expiry so a send never races a token that
# expires mid-request.
_REFRESH_SKEW = timedelta(minutes=2)


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

    def save_gmail_connection(
        self,
        *,
        organization_id: uuid.UUID,
        connected_by_user_id: uuid.UUID | None,
        tokens: GmailTokens,
        account_email: str | None,
    ) -> IntegrationConnection:
        """Create or replace this org's Gmail connection (upsert by
        (organization_id, provider) — reconnecting simply overwrites)."""
        existing = self.get_connection(organization_id, "gmail")
        refresh_token = tokens.refresh_token
        if existing and not refresh_token:
            # Google only issues a refresh_token on first consent per
            # account+client; a reconnect that didn't get one keeps using
            # the previously stored one rather than losing refresh ability.
            try:
                refresh_token_plain = decrypt_token(existing.refresh_token_encrypted) if existing.refresh_token_encrypted else None
            except TokenDecryptionError:
                refresh_token_plain = None
            refresh_token = refresh_token_plain

        row = existing or IntegrationConnection(
            organization_id=organization_id,
            provider="gmail",
        )
        row.connected_by_user_id = connected_by_user_id
        row.external_account_email = account_email
        row.access_token_encrypted = encrypt_token(tokens.access_token)
        row.refresh_token_encrypted = encrypt_token(refresh_token) if refresh_token else None
        row.token_expires_at = tokens.expires_at
        row.scopes = tokens.scope
        row.last_error = None
        row.updated_at = datetime.now(UTC)

        self.session.add(row)
        self.session.flush()
        self.session.refresh(row)
        return row

    def disconnect(self, organization_id: uuid.UUID, provider: str) -> bool:
        """Best-effort revoke with the provider, then delete our copy
        unconditionally — a failed revoke call must never leave a
        "disconnect" button that appears to do nothing."""
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

    def get_valid_gmail_access_token(self, organization_id: uuid.UUID) -> tuple[str, str] | None:
        """Return ``(access_token, from_address)`` for this org's connected
        Gmail account, refreshing first if the stored token is near expiry.

        Returns ``None`` when there's no connection, or when refresh fails
        (also records the failure on the row as ``last_error`` so the
        Integrations page can show "reconectar" instead of the connection
        silently going quiet).
        """
        row = self.get_connection(organization_id, "gmail")
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
                fresh = gmail_oauth.refresh_access_token(refresh_token)
            except (TokenDecryptionError, GmailOAuthError) as exc:
                row.last_error = str(exc)
                self.session.add(row)
                self.session.flush()
                return None

            access_token = fresh.access_token
            row.access_token_encrypted = encrypt_token(fresh.access_token)
            row.token_expires_at = fresh.expires_at
            row.last_error = None
            self.session.add(row)
            self.session.flush()

        from_address = row.external_account_email or ""
        if not from_address:
            return None
        return access_token, from_address
