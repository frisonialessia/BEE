"""Schemas for the Company (Empresa/Cuenta) endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict


class CompanyOut(BaseModel):
    """API representation of a tracked company/account."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    domain: str | None
    industry: str | None
    size: str | None
    country: str | None
    website: str | None
    description: str | None
    attributes: dict[str, Any]
