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
