"""Schemas for saved list-page views."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SavedViewCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    page: str = Field(min_length=1, max_length=64)
    config: dict[str, Any] = Field(default_factory=dict)
    is_shared: bool = False


class SavedViewUpdateIn(BaseModel):
    """Partial update — only fields present in the request are applied."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    config: dict[str, Any] | None = None
    is_shared: bool | None = None


class SavedViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    page: str
    config: dict[str, Any]
    is_shared: bool
    created_by_user_id: uuid.UUID | None
    created_at: datetime
