"""Schemas for the PsychographicAnalyzer API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DISCProfile(BaseModel):
    """DISC scores for a lead."""

    d_score: float = Field(ge=0.0, le=1.0)
    i_score: float = Field(ge=0.0, le=1.0)
    s_score: float = Field(ge=0.0, le=1.0)
    c_score: float = Field(ge=0.0, le=1.0)
    dominant_style: str
    secondary_style: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    style_label: str
    preferred_tone: str
    preferred_message_length: str
    avoid_phrases: list[str]
    classification_source: str
    classification_notes: str | None = None


class LeadPsychographicOut(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    d_score: float
    i_score: float
    s_score: float
    c_score: float
    dominant_style: str
    secondary_style: str | None
    confidence: float
    style_label: str
    preferred_tone: str
    preferred_message_length: str
    avoid_phrases: list[str]
    classification_source: str
    classification_notes: str | None
    classified_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class ContentAdaptRequest(BaseModel):
    """Request to adapt content to a lead's DISC style."""

    content: str = Field(min_length=10, description="Original content to adapt")
    lead_id: uuid.UUID
    artifact_type: str = Field(default="email", description="email | linkedin_message | meeting_agenda")


class AdaptedContent(BaseModel):
    """Result of PsychographicStyleAdapter.apply()."""

    original: str
    adapted: str
    disc_style: str
    adaptations_applied: list[str] = Field(description="List of style changes made")
    confidence: float
    artifact_type: str
