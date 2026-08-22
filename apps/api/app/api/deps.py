"""Reusable FastAPI dependencies.

Centralizing dependency providers keeps endpoints thin and makes wiring explicit.
Endpoints declare what they need (a session, the engine) and FastAPI injects it —
a clean application of Dependency Injection.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.database import get_session
from app.core.security import InvalidTokenError, decode_access_token
from app.models.base import UserRole
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
