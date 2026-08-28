"""Schemas for GET /integrations and the Gmail connect/disconnect flow."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class IntegrationStatusOut(BaseModel):
    """One row of the Integrations page.

    ``scope`` tells the frontend whether this is a real per-organization
    connection with its own Connect/Disconnect button ("organization") or a
    server-wide credential set by whoever deployed BEE, shown read-only for
    transparency ("server") — see app.services.omnichannel for the latter.
    """

    provider: str
    label: str
    connected: bool
    scope: str  # "organization" | "server"
    account_email: str | None = None
    connected_at: datetime | None = None
    detail: str | None = None
    last_error: str | None = None


class AuthorizeUrlOut(BaseModel):
    authorize_url: str
