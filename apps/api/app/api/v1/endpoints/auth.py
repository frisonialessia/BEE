"""Auth endpoints — organization signup, login, and the current session."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_session
from app.core.security import create_access_token, hash_password, verify_password
from app.core.signup_guard import get_signup_guard
from app.models.user import User
from app.schemas.auth import OrganizationRegister, PasswordChangeIn, TokenResponse, UserLogin, UserOut
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


def _client_key(request: Request) -> str:
    """Best-effort caller identity for the signup rate limiter.

    ``request.client.host`` is the proxy's address behind most PaaS
    deployments (Vercel included) unless the real client IP is forwarded —
    fall back to a fixed key rather than raising, so a missing header
    degrades to "one shared bucket" instead of breaking registration.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new organization and its OWNER user",
)
def register(
    data: OrganizationRegister, request: Request, session: Session = Depends(get_session)
) -> TokenResponse:
    """Bootstrap a brand-new organization.

    This is the *only* way an Organization comes into existence — there is no
    "join an existing org" self-serve flow. Every subsequent teammate is added
    by an OWNER/ADMIN via ``POST /api/v1/users``.

    Two abuse-protection layers guard this fully-open endpoint (see
    ``app.core.signup_guard``'s module docstring for the full rationale):
    an optional shared invite code, and a per-IP rate limit independent of it.
    """
    settings = get_settings()

    if settings.SIGNUP_INVITE_CODE:
        if not data.invite_code or not hmac.compare_digest(data.invite_code, settings.SIGNUP_INVITE_CODE):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or missing invite code.")

    if not get_signup_guard().try_consume(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many signup attempts from this address. Try again later.",
        )

    service = AuthService(session)
    try:
        org, user = service.register_organization(data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    token = create_access_token(user.id, organization_id=org.id, role=user.role.value)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Exchange email/password for a session token",
)
def login(data: UserLogin, session: Session = Depends(get_session)) -> TokenResponse:
    service = AuthService(session)
    user = service.authenticate(data.email, data.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut, summary="Return the logged-in user")
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the logged-in user's own password",
)
def change_my_password(
    data: PasswordChangeIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Self-service password change — every role can do this for themselves,
    no admin action required. Requires the current password (see
    ``PasswordChangeIn``'s docstring for why); existing session tokens stay
    valid (JWTs aren't revocable short of expiry — see ``app.core.security``),
    so a caller worried about a leaked token should treat re-logging in
    everywhere as a separate, manual step.
    """
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect.")

    current_user.hashed_password = hash_password(data.new_password)
    session.add(current_user)
    session.commit()
