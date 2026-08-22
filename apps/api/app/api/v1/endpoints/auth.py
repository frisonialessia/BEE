"""Auth endpoints — organization signup, login, and the current session."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.database import get_session
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import OrganizationRegister, TokenResponse, UserLogin, UserOut
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new organization and its OWNER user",
)
def register(data: OrganizationRegister, session: Session = Depends(get_session)) -> TokenResponse:
    """Bootstrap a brand-new organization.

    This is the *only* way an Organization comes into existence — there is no
    "join an existing org" self-serve flow. Every subsequent teammate is added
    by an OWNER/ADMIN via ``POST /api/v1/users``.
    """
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
