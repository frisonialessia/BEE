"""Reusable FastAPI dependencies.

Centralizing dependency providers keeps endpoints thin and makes wiring explicit.
Endpoints declare what they need (a session, the engine) and FastAPI injects it —
a clean application of Dependency Injection.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import InvalidTokenError, decode_access_token, hash_api_key
from app.models.base import UserRole
from app.models.organization_api_key import OrganizationApiKey
from app.models.user import User
from app.services.signal_engine import SignalEngine

# auto_error=False so a missing header raises our own 401 (with a clearer
# message) instead of FastAPI's generic one, and so get_current_user_optional
# can distinguish "no token" from "bad token".
_bearer_scheme = HTTPBearer(auto_error=False)


def get_signal_engine(
    session: Session = Depends(get_session),
) -> Generator[SignalEngine, None, None]:
    """Provide a :class:`SignalEngine` bound to the request's DB session."""
    yield SignalEngine(session)


def _load_user_from_token(token: str, session: Session) -> User:
    try:
        payload = decode_access_token(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired session token: {exc}",
        ) from exc

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed session token.") from exc

    user = session.get(User, user_id)
    if user is None or not user.is_active:
        # Re-checked on every request (not just at token issuance) so
        # deactivating a user takes effect immediately, not at token expiry.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Resolve the logged-in :class:`User` from the ``Authorization: Bearer`` header.

    Use this on any endpoint that must be logged-in-only. For an endpoint that
    should behave one way for anonymous/API-key callers and another for a
    logged-in user (e.g. scoping a list to what they can see), use
    :func:`get_current_user_optional` instead.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token. Include an 'Authorization: Bearer <token>' header.",
        )
    return _load_user_from_token(credentials.credentials, session)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    session: Session = Depends(get_session),
) -> User | None:
    """Like :func:`get_current_user`, but returns ``None`` instead of 401 when
    no bearer token is present at all — for endpoints that stay usable by
    API-key-only callers (no logged-in user) while adding visibility scoping
    when a session token *is* present. A malformed/expired token still 401s
    rather than silently falling back to "anonymous", so a caller can't lose
    their scoping by accident.
    """
    if credentials is None:
        return None
    return _load_user_from_token(credentials.credentials, session)


def _resolve_org_api_key(plaintext: str | None, session: Session) -> uuid.UUID | None:
    """Shared lookup behind :func:`get_organization_from_api_key` and
    :func:`get_organization_from_webhook_key`.

    Returns ``None`` when no key is presented at all — ingestion stays
    backward-compatible with the single-shared-secret model (the created
    records simply stay untagged, same as before organization API keys
    existed). A *presented but invalid/inactive* key still 401s rather than
    silently falling back to untagged, so a typo'd or revoked key fails
    loudly instead of quietly leaking data into the global pool.
    """
    if plaintext is None:
        return None

    key = session.exec(
        select(OrganizationApiKey).where(
            OrganizationApiKey.key_hash == hash_api_key(plaintext),
            OrganizationApiKey.is_active,
        )
    ).first()
    if key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key.")

    key.last_used_at = datetime.now(UTC)
    session.add(key)
    session.flush()
    return key.organization_id


def get_organization_from_api_key(
    x_bee_org_key: str | None = Header(default=None, alias="X-BEE-Org-Key"),
    session: Session = Depends(get_session),
) -> uuid.UUID | None:
    """Resolve the tenant for a webhook/integration call from an org API key
    presented as a header — see :func:`_resolve_org_api_key`."""
    return _resolve_org_api_key(x_bee_org_key, session)


def get_organization_from_webhook_key(
    x_bee_org_key: str | None = Header(default=None, alias="X-BEE-Org-Key"),
    org_key: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> uuid.UUID | None:
    """Resolve the tenant for ``POST /webhooks/receive`` from an org API key.

    Unlike :func:`get_organization_from_api_key` (header-only — fine for
    integrations BEE's own frontend or scripts control), external providers
    (LinkedIn Sales Nav, G2, Google Alerts) are typically configured with
    only a destination *URL*, no custom headers — so this also accepts the
    key as an ``?org_key=`` query parameter on the callback URL BEE gives
    that provider. Header takes precedence when both are somehow present.
    Same backward-compatible ``None``-when-absent contract as
    :func:`get_organization_from_api_key`: a webhook configured before
    per-org keys existed (or one that intentionally shares signals across
    the whole install) keeps working, untagged, exactly as before.
    """
    return _resolve_org_api_key(x_bee_org_key or org_key, session)


def require_organization_from_webhook_key(
    organization_id: uuid.UUID | None = Depends(get_organization_from_webhook_key),
) -> uuid.UUID:
    """Require a resolvable tenant identity from an org API key presented as
    either the ``X-BEE-Org-Key`` header or an ``?org_key=`` query parameter
    — see :func:`get_organization_from_webhook_key`.

    For endpoints meant to be pasted as a bare URL into a third-party tool
    that won't set custom headers (Power BI's "Web" data source, a plain
    ``curl``) — see ``app.api.v1.endpoints.bi_feed``. Unlike
    :func:`require_organization_id`, there is no JWT fallback: a BI feed
    URL is handed to a tool, not typed in by a logged-in user, so the only
    identity it can ever carry is the key baked into the URL itself.
    """
    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key (X-BEE-Org-Key header or ?org_key= query parameter).",
        )
    return organization_id


def get_organization_id(
    current_user: User | None = Depends(get_current_user_optional),
    api_key_org_id: uuid.UUID | None = Depends(get_organization_from_api_key),
) -> uuid.UUID | None:
    """The tenant for this request, from whichever caller identity is present.

    Dashboard calls carry a JWT (``current_user.organization_id``);
    webhook/pixel calls carry an org API key instead
    (:func:`get_organization_from_api_key`). Either identifies the tenant;
    neither present means an unscoped/legacy caller, same backward-compatible
    ``None`` as both dependencies individually. Shared across every endpoint
    that needs "which org is this for" without caring which identity supplied it.
    """
    if current_user is not None:
        return current_user.organization_id
    return api_key_org_id


def require_organization_id(
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> uuid.UUID:
    """Require a resolvable tenant identity (Bearer JWT or X-BEE-Org-Key) for
    this request — 401s instead of the bare :func:`get_organization_id`'s
    backward-compatible ``None``.

    ``get_organization_id`` returning ``None`` is the right default for a
    *read*: an unscoped/legacy caller still sees whatever is untagged/shared
    (see :func:`app.services.permissions.scope_by_organization_id`). It is
    the wrong default for anything that writes, mutates, or triggers an
    action — an anonymous caller must never reach that handler at all, or
    every organization's data becomes a shared write surface for anyone on
    the internet. Use this dependency (not the bare one) on every such
    endpoint. Mirrors the guard ``orchestrator.py``/``sequences.py`` already
    define locally for the same reason, centralized here so new endpoints
    don't have to reinvent it — or, as happened before this was added,
    forget it.
    """
    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required (Bearer token or X-BEE-Org-Key).",
        )
    return organization_id


def require_roles(*roles: UserRole):
    """Dependency factory: 403s unless the current user has one of ``roles``."""

    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(r.value for r in roles)}.",
            )
        return current_user

    return _dependency
