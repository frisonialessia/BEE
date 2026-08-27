"""Schemas for the internal support tool — see
``app.api.v1.endpoints.internal_support`` for the full rationale.
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr


class SupportPasswordResetIn(BaseModel):
    """Request body — identifies the locked-out user by email.

    Email is globally unique across the whole system (see
    ``AuthService.register_organization``), so no organization needs to be
    named to find the right account.
    """

    email: EmailStr


class SupportPasswordResetOut(BaseModel):
    """The new temporary password, shown exactly once.

    Never stored anywhere in plaintext (see ``generate_temporary_password``)
    — if this response is lost, the only recovery is calling the endpoint
    again, which simply issues a new one.
    """

    email: str
    temporary_password: str
    user_id: str
