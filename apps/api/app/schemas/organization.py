"""Schemas for organization-level settings — ICP criteria, the org's own
company profile (industry / employee range / website), the GDPR data
export, and the deletion-request flow."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.base import EmployeeRange
from app.schemas.auth import UserOut
from app.schemas.company import CompanyOut
from app.schemas.lead import LeadOut
from app.schemas.meeting import MeetingOut
from app.schemas.signal import OpportunityOut


class ICPCriteriaIn(BaseModel):
    """Replaces the org's ICP criteria wholesale — simpler than a partial
    patch for a handful of short lists a rep edits together in one form.

    Firmographic dimensions (industries/sizes/countries/revenue_ranges)
    match against Company fields directly. Buyer-persona dimensions
    (job_titles/seniorities) match against that company's Leads — BEE
    doesn't just track the account, it tracks who to actually reach there.
    tech_keywords matches against that company's tech_adoption signals — see
    lib/icp.ts's computeFitScore on the frontend for exactly how each
    dimension is scored; every one of these is an *optional* dimension, same
    "empty = no opinion, not no match" rule as the original three."""

    industries: list[str] = Field(default_factory=list, max_length=50)
    sizes: list[str] = Field(default_factory=list, max_length=50)
    countries: list[str] = Field(default_factory=list, max_length=50)
    revenue_ranges: list[str] = Field(default_factory=list, max_length=50)
    job_titles: list[str] = Field(default_factory=list, max_length=50)
    seniorities: list[str] = Field(default_factory=list, max_length=50)
    tech_keywords: list[str] = Field(default_factory=list, max_length=50)


class ICPCriteriaOut(BaseModel):
    industries: list[str]
    sizes: list[str]
    countries: list[str]
    revenue_ranges: list[str]
    job_titles: list[str]
    seniorities: list[str]
    tech_keywords: list[str]


class OrganizationProfileIn(BaseModel):
    """Partial patch — unlike ICPCriteriaIn, a field left out here keeps its
    current value rather than being wiped to null, since these three are
    typically filled in one at a time (the onboarding prompt only asks for
    employee_range; industry/website might come later from Settings)."""

    industry: str | None = Field(default=None, max_length=200)
    employee_range: EmployeeRange | None = None
    website: str | None = Field(default=None, max_length=300)


class OrganizationProfileOut(BaseModel):
    industry: str | None
    employee_range: EmployeeRange | None
    website: str | None


# ── GDPR data export ─────────────────────────────────────────────────────


class OrganizationDataExport(BaseModel):
    """GET /organizations/me/export's response — see that endpoint's own
    docstring for scope (core entities, capped per-entity, not literally
    every table this organization's data touches)."""

    organization_id: uuid.UUID
    organization_name: str
    exported_at: datetime
    users: list[UserOut]
    leads: list[LeadOut]
    companies: list[CompanyOut]
    opportunities: list[OpportunityOut]
    meetings: list[MeetingOut]
    truncated: list[str] = Field(
        default_factory=list,
        description="Entity types that hit the per-entity cap — contact support for a complete export.",
    )


# ── GDPR deletion request ────────────────────────────────────────────────


class DeletionRequestIn(BaseModel):
    """Re-typing the organization's exact name is the confirmation step —
    same "type to confirm" pattern a destructive action in any real SaaS
    dashboard uses, cheap insurance against a stray click doing something
    this consequential."""

    confirm_organization_name: str = Field(min_length=1, max_length=255)


class DeletionRequestOut(BaseModel):
    requested: bool
    requested_at: datetime | None
    requested_by_user_id: uuid.UUID | None
    detail: str


# ── Enterprise SSO ────────────────────────────────────────────────────────


class SSOConfigIn(BaseModel):
    """PATCH /organizations/me/sso's body — partial patch, same
    ``exclude_unset`` convention as OrganizationProfileIn, so an OWNER can
    set sso_connection_id today and flip sso_enabled on later without
    resending everything."""

    sso_enabled: bool | None = None
    sso_connection_id: str | None = Field(default=None, max_length=255)
    sso_domain: str | None = Field(default=None, max_length=255)


class SSOConfigOut(BaseModel):
    sso_enabled: bool
    sso_connection_id: str | None
    sso_domain: str | None
    # Whether the server-wide WORKOS_* settings are present — an OWNER can
    # fill in sso_connection_id/sso_domain and flip sso_enabled on even
    # before the BEE team has configured WorkOS globally, but SSO login
    # stays unreachable (POST /auth/sso/lookup reports sso_available=false)
    # until both are true. Surfaced here so the settings UI can explain
    # why turning it on didn't make the login screen show anything yet.
    globally_configured: bool
