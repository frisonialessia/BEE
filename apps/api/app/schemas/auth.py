"""Pydantic schemas (DTOs) for auth, organizations, teams, and users."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.base import UserRole


class OrganizationRegister(BaseModel):
    """First signup for a brand-new organization — creates its OWNER user."""

    organization_name: str = Field(min_length=2, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Required only when the deployment sets SIGNUP_INVITE_CODE (see
    # app.core.config) — a controlled-beta gate, not part of the permanent
    # product contract. Optional at the schema layer so a deployment that
    # never sets the setting keeps accepting requests that omit this field.
    invite_code: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeIn(BaseModel):
    """Self-service password change for the logged-in user.

    Distinct from the forgot-password flow below — this always requires the
    caller's *current* password, so a stolen session token alone can't be
    used to lock the real owner out.
    """

    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordIn(BaseModel):
    """Request a password-reset email. See ``POST /auth/forgot-password``.

    No password/token here by design — this only ever triggers an email
    send. The response is identical whether or not the address exists (see
    the endpoint), so the request body needs nothing an attacker could use
    to distinguish outcomes.
    """

    email: EmailStr


class ResetPasswordIn(BaseModel):
    """Redeem a password-reset token. See ``POST /auth/reset-password``."""

    token: str
    new_password: str = Field(min_length=8, max_length=128)


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class UserOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    team_id: uuid.UUID | None
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    avatar_url: str | None
    phone: str | None
    bio: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    parent_team_id: uuid.UUID | None = None


class TeamUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_team_id: uuid.UUID | None = None


class TeamOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    parent_team_id: uuid.UUID | None
    name: str
    description: str | None

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    """Admin/owner-only: create a teammate directly (no self-serve invite flow yet)."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    role: UserRole = UserRole.MEMBER
    team_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    """Admin/owner-only: change a teammate's role, team, or active status."""

    role: UserRole | None = None
    team_id: uuid.UUID | None = None
    is_active: bool | None = None


class UserProfileUpdateIn(BaseModel):
    """Self-service: the logged-in user editing their own profile.

    Deliberately a separate schema from ``UserUpdate`` — that one changes
    role/team/is_active, which only OWNER/ADMIN may touch and never about
    themselves; this one is the opposite (only ever the caller's own row,
    never role/team/is_active). Keeping them apart means neither endpoint
    can be tricked into doing the other's job.
    """

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    # A client-resized data: URI, not a link — see User.avatar_url's docstring.
    avatar_url: str | None = Field(default=None, max_length=300_000)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=500)


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ApiKeyOut(BaseModel):
    """Listing view — never carries the plaintext key, only ``key_prefix``."""

    id: uuid.UUID
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreated(ApiKeyOut):
    """Returned once, at creation time — the only moment the plaintext exists."""

    api_key: str
