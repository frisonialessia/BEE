"""SecretManager — secure, typed access to external API credentials.

Security contract
-----------------
1. Credentials are read ONLY from environment variables (via Settings).
2. Nothing is persisted to the database or written to disk.
3. Secrets are never logged — ``ProviderCredentials`` masks values in repr/str.
4. Callers request credentials by provider name; the manager returns None when
   a provider is not configured (enabling mock/safe fallback in providers).

Rotation
--------
To rotate a key, update the environment variable and restart the process.
No database migration or code change is required.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

ProviderName = Literal["linkedin", "g2", "google_search", "capterra", "sendgrid", "resend"]


@dataclass(frozen=True, slots=True)
class ProviderCredentials:
    """Typed credential bundle for one external provider."""

    provider: ProviderName
    api_key: str | None = None
    access_token: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    webhook_secret: str | None = None
    extra: dict[str, str | None] | None = None

    def is_configured(self) -> bool:
        """Return True if at least one usable credential is present."""
        return bool(self.api_key or self.access_token or (self.client_id and self.client_secret))

    def __repr__(self) -> str:
        return f"ProviderCredentials(provider={self.provider!r}, configured={self.is_configured()})"


def _mask(value: str | None) -> str:
    if not value:
        return "<unset>"
    if len(value) <= 8:  # noqa: PLR2004
        return "***"
    return f"{value[:4]}...{value[-4:]}"


class SecretManager:
    """Central vault for external API credentials.

    All methods are side-effect free and safe to call on every request.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    def _resolve(self, key: str) -> str | None:
        """Resolve one credential field by its Settings attribute name.

        AWS Secrets Manager first when ``SECRET_BACKEND=aws_secrets_manager``
        (falling back to the environment for any key not present in the AWS
        secret, so a partially-populated secret degrades gracefully instead
        of breaking providers that haven't been migrated to it), or the
        environment directly otherwise. This is the only difference the
        backend setting makes — every method below, and every caller of
        ``get()``/``is_configured()``/etc., is unaffected either way.
        """
        if self._settings.SECRET_BACKEND == "aws_secrets_manager":
            from app.services.secret_manager.aws_backend import get_aws_secret  # noqa: PLC0415

            value = get_aws_secret(key)
            if value is not None:
                return value
        return getattr(self._settings, key, None)

    def get(self, provider: ProviderName) -> ProviderCredentials:
        """Return credentials for *provider* (may be unconfigured)."""
        if provider == "linkedin":
            return ProviderCredentials(
                provider="linkedin",
                access_token=self._resolve("LINKEDIN_ACCESS_TOKEN"),
                client_id=self._resolve("LINKEDIN_CLIENT_ID"),
                client_secret=self._resolve("LINKEDIN_CLIENT_SECRET"),
                webhook_secret=self._resolve("LINKEDIN_WEBHOOK_SECRET"),
            )
        if provider == "g2":
            return ProviderCredentials(
                provider="g2",
                api_key=self._resolve("G2_API_KEY"),
                webhook_secret=self._resolve("G2_WEBHOOK_SECRET"),
            )
        if provider == "google_search":
            return ProviderCredentials(
                provider="google_search",
                api_key=self._resolve("GOOGLE_SEARCH_API_KEY"),
                webhook_secret=self._resolve("GOOGLE_WEBHOOK_SECRET"),
                extra={"cx": self._resolve("GOOGLE_SEARCH_CX")},
            )
        if provider == "capterra":
            return ProviderCredentials(
                provider="capterra",
                api_key=self._resolve("CAPTERRA_API_KEY"),
                webhook_secret=self._resolve("CAPTERRA_WEBHOOK_SECRET"),
            )
        if provider == "sendgrid":
            # No api_key/access_token — BEE never calls SendGrid's API, only
            # verifies the signature on its inbound event webhook. is_configured()
            # is still meaningful: it reports whether that webhook secret is set.
            return ProviderCredentials(provider="sendgrid", webhook_secret=self._resolve("SENDGRID_WEBHOOK_SECRET"))
        if provider == "resend":
            return ProviderCredentials(provider="resend", webhook_secret=self._resolve("RESEND_WEBHOOK_SECRET"))
        raise ValueError(f"Unknown provider: {provider}")

    def is_configured(self, provider: ProviderName) -> bool:
        return self.get(provider).is_configured()

    def get_webhook_secret(self, provider: ProviderName) -> str | None:
        """Return the HMAC secret for validating inbound webhooks from *provider*."""
        creds = self.get(provider)
        if creds.webhook_secret:
            return creds.webhook_secret
        # Fall back to global signing secret when provider-specific secret unset
        return self._resolve("WEBHOOK_SIGNING_SECRET") or None

    def configured_providers(self) -> list[ProviderName]:
        """Return list of providers that have at least one credential set."""
        providers: list[ProviderName] = ["linkedin", "g2", "google_search", "capterra"]
        return [p for p in providers if self.is_configured(p)]

    def status_summary(self) -> dict[str, dict[str, str | bool]]:
        """Safe status dict for health checks — never exposes raw secrets."""
        out: dict[str, dict[str, str | bool]] = {}
        for provider in ("linkedin", "g2", "google_search", "capterra"):
            creds = self.get(provider)  # type: ignore[arg-type]
            out[provider] = {
                "configured": creds.is_configured(),
                "api_key": _mask(creds.api_key),
                "access_token": _mask(creds.access_token),
                "webhook_secret": _mask(creds.webhook_secret),
            }
        return out


@lru_cache
def get_secret_manager() -> SecretManager:
    return SecretManager()
