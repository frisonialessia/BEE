"""Auth endpoints — organization signup, login, and the current session."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.login_guard import get_login_guard
from app.core.password_reset_guard import get_password_reset_guard
from app.core.security import create_access_token, hash_password, verify_password
from app.core.signup_guard import get_signup_guard
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordIn,
    OrganizationRegister,
    PasswordChangeIn,
    ResetPasswordIn,
    TokenResponse,
    UserLogin,
    UserOut,
)
from app.services.auth import AuthService

logger = get_logger(__name__)

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

    if settings.SIGNUP_INVITE_CODE and (
        not data.invite_code or not hmac.compare_digest(data.invite_code, settings.SIGNUP_INVITE_CODE)
    ):
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
def login(data: UserLogin, request: Request, session: Session = Depends(get_session)) -> TokenResponse:
    """Rate-limited per-IP (see ``app.core.login_guard`` for why not per-email)
    — previously this endpoint had no abuse protection of any kind, meaning
    unlimited password guesses against any account."""
    if not get_login_guard().try_consume(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts from this address. Try again later.",
        )

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


@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    summary="Request a password-reset email",
)
def forgot_password(
    data: ForgotPasswordIn, request: Request, session: Session = Depends(get_session)
) -> dict[str, str]:
    """The self-serve entry point that didn't exist before this endpoint —
    previously the only recovery path was the BEE-team-only emergency tool
    (``POST /api/v1/internal/support/reset-password``).

    Always returns the same generic 200 regardless of whether the email
    matches an account — same anti-enumeration posture as ``/auth/login``
    and ``AuthService.authenticate``. Rate-limited per-IP, independent of
    whether the address exists, so this can't be used to spam a real
    customer's inbox either.
    """
    if not get_password_reset_guard().try_consume(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many reset attempts from this address. Try again later.",
        )

    service = AuthService(session)
    result = service.create_password_reset_token(data.email)
    if result is not None:
        user, plaintext_token = result
        settings = get_settings()
        reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={plaintext_token}"

        from app.services.omnichannel.interface import ChannelPayload
        from app.services.omnichannel.providers.email import EmailProvider

        result_send = EmailProvider().send(
            ChannelPayload(
                channel="email",
                recipient_id=user.email,
                subject="Reset your BEE password",
                body=(
                    f"Hi {user.full_name},\n\n"
                    "Someone requested a password reset for your BEE account. "
                    f"If this was you, set a new password here:\n\n{reset_link}\n\n"
                    f"This link expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes. "
                    "If you didn't request this, you can safely ignore this email — "
                    "your password hasn't changed."
                ),
            )
        )
        if not result_send.success:
            logger.warning("forgot-password: email send failed for user_id=%s: %s", user.id, result_send.error)

    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Redeem a password-reset token",
)
def reset_password(data: ResetPasswordIn, session: Session = Depends(get_session)) -> None:
    service = AuthService(session)
    if not service.reset_password(data.token, data.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Request a new one.",
        )
