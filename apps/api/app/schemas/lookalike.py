"""Schema for GET /companies/lookalikes — see app.services.lookalike.service."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class LookalikeCompanyOut(BaseModel):
    """One untapped company that resembles the organization's closed-won book."""

    company_id: uuid.UUID
    name: str
    industry: str | None = None
    size: str | None = None
    country: str | None = None
    similarity: float = Field(description="0 (no resemblance) .. 1 (near-identical profile)")
