"""Pydantic schemas (DTOs) for the Lead read API."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.base import LeadStatus


class LeadCreateIn(BaseModel):
    """Manual lead creation — the CSV/manual-entry path, not signal ingestion."""

    full_name: str = Field(min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    email: str | None = Field(default=None, max_length=255)
    title: str | None = Field(default=None, max_length=255)
    seniority: str | None = Field(default=None, max_length=64)
    linkedin_url: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=64)


class LeadOut(BaseModel):
    """API representation of a persisted lead."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID | None
    organization_id: uuid.UUID | None
    assigned_to_user_id: uuid.UUID | None
    full_name: str
    email: str | None
    title: str | None
    seniority: str | None
    linkedin_url: str | None
    phone: str | None
    status: LeadStatus
    score: float
    attributes: dict[str, Any]
