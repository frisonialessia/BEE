"""Pydantic schemas (DTOs) for the Lead read API."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.base import LeadStatus


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
