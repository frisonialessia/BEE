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

    Distinct from a future admin-reset or forgot-password flow (neither
    exists yet) — this always requires the caller's *current* password, so
    a stolen session token alone can't be used to lock the real owner out.
    """

    current_password: str
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
