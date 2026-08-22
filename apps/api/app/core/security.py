"""Security utilities for inbound integrations and user authentication.

Two distinct trust boundaries live here:

1. **Webhook HMAC** (below) — the Signal Engine accepts webhooks from external
   systems (CRMs, enrichment providers, news/intent-data vendors). To ensure
   only trusted senders can push signals, we verify an HMAC-SHA256 signature
   computed over the raw request body with a shared secret.

2. **User auth** (:func:`hash_password`/:func:`verify_password`/
   :func:`create_access_token`/:func:`decode_access_token`) — a human logging
   into the BEE dashboard authenticates with an email/password, and every
   subsequent request carries a signed JWT identifying *who* they are and
   *what organization/role* they belong to, which ``app.services.permissions``
   uses to scope what they can see. This is orthogonal to ``API_SECRET_KEY``
   (a single shared secret for service-to-service calls) — a request can
   carry both.

Keeping this logic isolated (Single Responsibility) means each verification
strategy can evolve independently without touching the endpoints that rely on it.
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

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


# ---------------------------------------------------------------------------
# User authentication — password hashing (bcrypt) + session tokens (JWT)
# ---------------------------------------------------------------------------

_JWT_SUBJECT_TYPE = "user"


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password with bcrypt for storage.

    bcrypt has a 72-byte input limit (silently truncates beyond it); we encode
    as UTF-8 and let that limit apply rather than pre-truncating ourselves, so
    a caller who needs longer secrets sees the standard bcrypt behavior.
    """
    salt = bcrypt.gensalt(rounds=settings.PASSWORD_HASH_ROUNDS)
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plaintext password against a stored bcrypt hash.

    ``bcrypt.checkpw`` is itself constant-time with respect to the hash
    comparison, so no additional timing-attack mitigation is needed here.
    Returns ``False`` (never raises) for a malformed/legacy hash so a bad
    stored value degrades to "login denied" rather than a 500.
    """
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    user_id: uuid.UUID,
    *,
    organization_id: uuid.UUID,
    role: str,
    expires_minutes: int | None = None,
) -> str:
    """Issue a signed JWT session token for a logged-in user.

    The payload is deliberately minimal (subject id, org id, role, expiry) —
    enough for ``app.api.deps.get_current_user`` to load the full ``User`` row
    and re-check ``is_active``/role on every request, rather than trusting a
    stale claim indefinitely. Revoking access (deactivating a user) therefore
    takes effect on their very next request, not just at token expiry.
    """
    now = datetime.now(UTC)
    expires_delta = timedelta(minutes=expires_minutes if expires_minutes is not None else settings.JWT_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": _JWT_SUBJECT_TYPE,
        "org": str(organization_id),
        "role": role,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


class InvalidTokenError(Exception):
    """Raised when a JWT is missing, malformed, expired, or wrongly typed."""


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify and decode a session JWT, returning its payload.

    Raises :class:`InvalidTokenError` for any failure (expired, bad signature,
    malformed, wrong ``type`` claim) so callers have exactly one exception to
    handle, regardless of which underlying PyJWT error triggered it.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    if payload.get("type") != _JWT_SUBJECT_TYPE:
        raise InvalidTokenError("Token is not a user session token.")
    return payload
