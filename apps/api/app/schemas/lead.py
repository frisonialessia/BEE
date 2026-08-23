"""Pydantic schemas (DTOs) for the Lead read API."""

from __future__ import annotations

import uuid
from datetime import datetime
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


class LeadBulkCreateIn(BaseModel):
    """Bulk import — the CSV path. Parsing happens client-side; this just
    takes the already-parsed rows so the backend stays format-agnostic.
    """

    leads: list[LeadCreateIn] = Field(min_length=1, max_length=1000)


class LeadBulkError(BaseModel):
    row: int
    message: str


class LeadBulkResult(BaseModel):
    created_count: int
    errors: list[LeadBulkError]


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
    # Populated by DataValidator — see app.services.data_validator.
    data_freshness_score: float
    validation_flags: list[str]
    last_validated_at: datetime | None
    stale_risk: bool


class LeadValidationOut(BaseModel):
    """Result of an on-demand DataValidator run against one lead."""

    lead_id: uuid.UUID
    flags: list[str]
    freshness_score: float
    stale_risk: bool
    validated_at: datetime
