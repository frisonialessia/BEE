"""Schemas for the CorrectionLearningService API."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field


class CorrectionIn(BaseModel):
    """CEO submits an edited artifact for learning."""

    original_content: str = Field(description="The artifact content as BEE originally generated it")
    edited_content: str = Field(description="The content after the CEO finished editing")
    artifact_type: str = Field(description="email_draft | meeting_agenda | linkedin_message | next_steps")
    opportunity_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None
    generator_name: str | None = None
    psychographic_style: str | None = Field(default=None, description="DISC style of the lead at correction time")
    channel: str | None = None


class CorrectionOut(BaseModel):
    """Response after a correction is processed and the style profile is updated."""

    correction_id: uuid.UUID
    artifact_type: str
    diff_ops: list[dict[str, Any]]
    extracted_rules: list[str]
    change_ratio: float
    style_summary: str
    authoritative_rules_count: int
    total_corrections: int
    profile_version: int


class StyleProfileOut(BaseModel):
    """The current CEO style profile — shows what BEE has learned."""

    total_corrections: int
    authoritative_rules_count: int
    style_summary: str
    profile_version: int
    last_correction_at: str | None
    rules_by_type: dict[str, Any]
