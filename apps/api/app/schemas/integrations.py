"""Schemas for GET /integrations, the connect/disconnect flow, and the
Salesforce import endpoint."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


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
    # "crm" | "email" | "social" | "automation" | "bi" — lets the frontend
    # group the page by what kind of tool this is instead of hand-picking
    # each provider by name (see IntegrationsView.tsx). Optional/untyped on
    # purpose, same reasoning as IntegrationConnection.provider being a
    # free string: new categories need no migration here either.
    category: str | None = None
    account_email: str | None = None
    connected_at: datetime | None = None
    detail: str | None = None
    # Machine-readable twin of ``detail`` so the frontend can translate it —
    # ``detail`` itself is a Spanish sentence composed here and rendered
    # verbatim, which is why the Integrations page kept a Spanish line under
    # every card in the English UI. Frontend falls back to ``detail`` for any
    # code it doesn't know, so adding a code never breaks an older client.
    detail_code: str | None = None
    detail_params: dict[str, str] = Field(default_factory=dict)
    last_error: str | None = None


class AuthorizeUrlOut(BaseModel):
    authorize_url: str


class ImportCountsOut(BaseModel):
    created: int = 0
    updated: int = 0
    skipped: int = 0


class SalesforceImportSummaryOut(BaseModel):
    """Result of POST /integrations/salesforce/import — always returned,
    even on partial failure (see ``errors``), so the rep sees exactly what
    happened instead of a bare success/fail."""

    companies: ImportCountsOut = Field(default_factory=ImportCountsOut)
    leads: ImportCountsOut = Field(default_factory=ImportCountsOut)
    opportunities: ImportCountsOut = Field(default_factory=ImportCountsOut)
    errors: list[str] = Field(default_factory=list)


# POST /integrations/hubspot/import's result is the exact same shape —
# a distinct name for the response_model/OpenAPI schema rather than
# reusing "Salesforce"'s, without duplicating the class.
HubSpotImportSummaryOut = SalesforceImportSummaryOut


class JiraConfigIn(BaseModel):
    """Body for PATCH /integrations/jira/config — the one setting
    JiraSyncHandler needs beyond the OAuth connection itself. See
    IntegrationConnection.config's docstring."""

    project_key: str = Field(min_length=1, max_length=64)
