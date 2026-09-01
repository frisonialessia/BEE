"""Schemas for organization-level settings — ICP criteria and the org's own
company profile (industry / employee range / website)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.base import EmployeeRange


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
