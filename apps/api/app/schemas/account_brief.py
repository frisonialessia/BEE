"""Schemas for the AccountResearchAgent API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AccountBriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    summary: str
    findings: dict[str, Any]
    sources: list[str]
    generated_by: str
    model_used: str | None
    created_at: datetime


class AccountResearchResult(BaseModel):
    """Response of POST /companies/{id}/research — the brief plus whether
    it's fresh-from-cache, newly generated, or postponed by the daily
    budget (never a hard failure — see AccountResearchAgent.research)."""

    brief: AccountBriefOut | None
    from_cache: bool
    budget_exceeded: bool = False
    disabled: bool = False
