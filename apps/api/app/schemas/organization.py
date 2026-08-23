"""Schemas for organization-level settings (currently: ICP criteria)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ICPCriteriaIn(BaseModel):
    """Replaces the org's ICP criteria wholesale — simpler than a partial
    patch for three short lists a rep edits together in one form."""

    industries: list[str] = Field(default_factory=list, max_length=50)
    sizes: list[str] = Field(default_factory=list, max_length=50)
    countries: list[str] = Field(default_factory=list, max_length=50)


class ICPCriteriaOut(BaseModel):
    industries: list[str]
    sizes: list[str]
    countries: list[str]
