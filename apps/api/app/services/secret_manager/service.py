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

ProviderName = Literal["linkedin", "g2", "google_search", "capterra"]


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

    def get(self, provider: ProviderName) -> ProviderCredentials:
        """Return credentials for *provider* (may be unconfigured)."""
        if provider == "linkedin":
            return ProviderCredentials(
                provider="linkedin",
                access_token=self._settings.LINKEDIN_ACCESS_TOKEN,
                client_id=self._settings.LINKEDIN_CLIENT_ID,
                client_secret=self._settings.LINKEDIN_CLIENT_SECRET,
                webhook_secret=self._settings.LINKEDIN_WEBHOOK_SECRET,
            )
        if provider == "g2":
            return ProviderCredentials(
                provider="g2",
                api_key=self._settings.G2_API_KEY,
                webhook_secret=self._settings.G2_WEBHOOK_SECRET,
            )
        if provider == "google_search":
            return ProviderCredentials(
                provider="google_search",
                api_key=self._settings.GOOGLE_SEARCH_API_KEY,
                webhook_secret=self._settings.GOOGLE_WEBHOOK_SECRET,
                extra={"cx": self._settings.GOOGLE_SEARCH_CX},
            )
        if provider == "capterra":
            return ProviderCredentials(
                provider="capterra",
                api_key=self._settings.CAPTERRA_API_KEY,
                webhook_secret=self._settings.CAPTERRA_WEBHOOK_SECRET,
            )
        raise ValueError(f"Unknown provider: {provider}")

    def is_configured(self, provider: ProviderName) -> bool:
        return self.get(provider).is_configured()

    def get_webhook_secret(self, provider: ProviderName) -> str | None:
        """Return the HMAC secret for validating inbound webhooks from *provider*."""
        creds = self.get(provider)
        if creds.webhook_secret:
            return creds.webhook_secret
        # Fall back to global signing secret when provider-specific secret unset
        return self._settings.WEBHOOK_SIGNING_SECRET or None

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
