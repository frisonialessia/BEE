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
import secrets
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


def generate_temporary_password() -> str:
    """Generate a random, high-entropy temporary password.

    Used by the support password-reset tool (see
    ``app.api.v1.endpoints.internal_support``) instead of letting the
    secret-holder invent one — a machine-generated value can't be weak or
    reused, and it's shown to the caller exactly once, the same
    show-once-never-stored contract as :func:`generate_api_key`.
    """
    return secrets.token_urlsafe(18)


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


# ---------------------------------------------------------------------------
# Organization API keys — per-tenant ingestion auth
# ---------------------------------------------------------------------------
#
# Distinct from both boundaries above: WEBHOOK_SIGNING_SECRET / API_SECRET_KEY
# are single, shared secrets that authenticate "some trusted integration" but
# carry no tenant identity, and JWTs authenticate a human dashboard session.
# An organization API key answers a third question — "which organization does
# this ingested signal belong to?" — for integrations (Zapier, a customer's
# own scripts, enrichment pipelines) that push data via
# ``POST /signals/webhook`` without a logged-in user. See
# ``app.models.organization_api_key`` for the storage model.

_API_KEY_PREFIX = "bee_org_"


def generate_api_key() -> tuple[str, str]:
    """Generate a new organization API key.

    Returns ``(plaintext, key_hash)``. The plaintext is shown to the caller
    exactly once at creation time and is never itself stored — only its
    SHA-256 hash is persisted, so a database leak alone can't be replayed as
    a live key. Unlike :func:`hash_password`, this uses a fast deterministic
    hash (not bcrypt): the token is already high-entropy and machine-
    generated rather than user-chosen, and verification must be a hash
    lookup (not a per-row salted compare) since it runs on every ingestion
    request.
    """
    plaintext = _API_KEY_PREFIX + secrets.token_urlsafe(32)
    return plaintext, hash_api_key(plaintext)


def hash_api_key(plaintext: str) -> str:
    """Hash an API key for storage or lookup. See :func:`generate_api_key`."""
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


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


# ---------------------------------------------------------------------------
# OAuth connect-flow state — third-party integration handshakes
# (see app.services.integrations / app.api.v1.endpoints.integrations)
# ---------------------------------------------------------------------------
#
# A provider's OAuth callback (e.g. Google redirecting back to
# /integrations/gmail/callback) is a plain top-level browser navigation —
# it carries neither our Authorization bearer token nor X-API-Key, so it
# can't be authenticated the normal way. Instead, the *authorize* step (which
# IS an authenticated dashboard call) mints one of these short-lived,
# signed tokens carrying the organization id and a fixed "purpose" claim,
# passed through Google untouched as the OAuth ``state`` parameter. The
# callback verifies it instead of trusting anything the redirect itself
# claims — same signing key and library as session JWTs (settings.JWT_SECRET_KEY
# via PyJWT), but a distinct "type" so an oauth_state token can never be
# replayed as a real session token or vice versa.

_OAUTH_STATE_TYPE = "oauth_state"


def create_oauth_state_token(
    organization_id: uuid.UUID,
    *,
    purpose: str,
    expires_minutes: int = 10,
) -> str:
    """Mint a short-lived, signed token to pass as an OAuth ``state`` param.

    ``purpose`` (e.g. "gmail_connect") is checked on decode so a state token
    minted for one provider's flow can't be replayed against another's.
    """
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "type": _OAUTH_STATE_TYPE,
        "purpose": purpose,
        "org": str(organization_id),
        "nonce": secrets.token_urlsafe(8),
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_oauth_state_token(token: str, *, expected_purpose: str) -> uuid.UUID:
    """Verify an OAuth ``state`` token and return the organization id it names.

    Raises :class:`InvalidTokenError` for any failure — expired, forged,
    wrong purpose, or a session token presented in its place — so the
    callback endpoint has one failure mode to handle (reject the connect
    attempt) rather than needing to reason about PyJWT's exception hierarchy.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    if payload.get("type") != _OAUTH_STATE_TYPE or payload.get("purpose") != expected_purpose:
        raise InvalidTokenError("Token is not a valid state token for this OAuth flow.")
    try:
        return uuid.UUID(payload["org"])
    except (KeyError, ValueError) as exc:
        raise InvalidTokenError("State token is missing a valid organization id.") from exc
