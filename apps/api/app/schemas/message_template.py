"""Schemas for the message template library."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MessageTemplateCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    channel: str = Field(default="email", max_length=32)
    subject: str | None = Field(default=None, max_length=300)
    body: str = Field(min_length=1, max_length=5000)


class MessageTemplateUpdateIn(BaseModel):
    """Partial update — only fields present in the request are applied."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    channel: str | None = Field(default=None, max_length=32)
    subject: str | None = None
    body: str | None = Field(default=None, min_length=1, max_length=5000)


class MessageTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    channel: str
    subject: str | None
    body: str
    created_at: datetime
