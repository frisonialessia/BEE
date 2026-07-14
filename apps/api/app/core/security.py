"""Security utilities for inbound integrations.

The Signal Engine accepts webhooks from external systems (CRMs, enrichment
providers, news/intent-data vendors). To ensure only trusted senders can push
signals, we verify an HMAC-SHA256 signature computed over the raw request body
with a shared secret.

Keeping this logic isolated (Single Responsibility) means the verification
strategy can evolve — e.g. per-integration keys, rotating secrets, or JWTs —
without touching the endpoints that rely on it.
"""

from __future__ import annotations

import hashlib
import hmac

from app.core.config import settings


def compute_signature(payload: bytes, secret: str | None = None) -> str:
    """Compute the expected ``sha256=<hex>`` signature for a raw payload.

    Exposed publicly so that outbound test tooling and integration docs can
    reproduce exactly what upstream senders must compute.
    """
    key = (secret or settings.WEBHOOK_SIGNING_SECRET).encode("utf-8")
    digest = hmac.new(key, payload, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def verify_webhook_signature(payload: bytes, signature: str | None) -> bool:
    """Return ``True`` if the provided signature is valid for the payload.

    Uses :func:`hmac.compare_digest` to avoid timing attacks. When signature
    verification is disabled via configuration (typical for local development),
    the check is skipped and access is granted. In production the flag should be
    enabled so unsigned requests are rejected.
    """
    if not settings.WEBHOOK_SIGNATURE_REQUIRED:
        return True

    if not signature:
        return False

    expected = compute_signature(payload)
    return hmac.compare_digest(expected, signature)


def verify_provider_webhook_signature(
    payload: bytes,
    signature: str | None,
    provider: str,
) -> bool:
    """Verify HMAC signature for an inbound external-provider webhook.

    Uses the provider-specific secret from :class:`SecretManager` when configured,
    falling back to the global ``WEBHOOK_SIGNING_SECRET``.

    When ``WEBHOOK_SIGNATURE_REQUIRED`` is False (local dev), verification is
    skipped — same behaviour as :func:`verify_webhook_signature`.
    """
    if not settings.WEBHOOK_SIGNATURE_REQUIRED:
        return True

    if not signature:
        return False

    from app.services.secret_manager import get_secret_manager

    secret = get_secret_manager().get_webhook_secret(provider)  # type: ignore[arg-type]
    if not secret:
        return False

    expected = compute_signature(payload, secret=secret)
    # Accept with or without sha256= prefix
    sig = signature if signature.startswith("sha256=") else f"sha256={signature}"
    return hmac.compare_digest(expected, sig)
