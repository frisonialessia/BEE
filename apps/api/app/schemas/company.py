"""Schemas for the Company (Empresa/Cuenta) endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CompanyCreateIn(BaseModel):
    """Manual company creation — the CSV/manual-entry path, not signal ingestion."""

    name: str = Field(min_length=1, max_length=255)
    domain: str | None = Field(default=None, max_length=255)
    industry: str | None = Field(default=None, max_length=255)
    size: str | None = Field(default=None, max_length=64)
    country: str | None = Field(default=None, max_length=255)
    revenue_range: str | None = Field(default=None, max_length=64)
    website: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)


class CompanyOut(BaseModel):
    """API representation of a tracked company/account."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    domain: str | None
    industry: str | None
    size: str | None
    country: str | None
    revenue_range: str | None
    website: str | None
    description: str | None
    attributes: dict[str, Any]
    created_at: datetime
