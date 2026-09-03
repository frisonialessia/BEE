"""Schemas for the pre-login SSO discovery endpoint — see
app.api.v1.endpoints.sso."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class SSOLookupIn(BaseModel):
    email: EmailStr = Field(max_length=255)


class SSOLookupOut(BaseModel):
    """Deliberately returns the same shape (sso_available=False,
    authorize_url=None) whether the email's domain matches no
    organization at all, or matches one that simply hasn't turned SSO on
    — never leaks which case it is. This endpoint runs with no
    authentication, before BEE knows who's asking."""

    sso_available: bool
    authorize_url: str | None = None
