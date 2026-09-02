"""Schemas for the PersonalBrandService API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class VoiceProfileCreate(BaseModel):
    display_name: str
    title: str | None = None
    language: str = "en"
    tone_descriptors: list[str] = Field(default_factory=list)
    authority_topics: list[str] = Field(default_factory=list)
    forbidden_phrases: list[str] = Field(default_factory=list)
    max_sentence_words: int = 25
    use_emojis: bool = False
    preferred_cta: str | None = None
    bio_summary: str | None = None


class VoiceProfileOut(BaseModel):
    id: uuid.UUID
    display_name: str
    title: str | None
    language: str
    tone_descriptors: list[str]
    authority_topics: list[str]
    forbidden_phrases: list[str]
    max_sentence_words: int
    use_emojis: bool
    preferred_cta: str | None
    bio_summary: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VoiceProfileExtractRequest(BaseModel):
    """Raw writing samples (emails, LinkedIn posts, past outreach) to derive a
    VoiceProfile draft from, instead of filling every field by hand."""

    raw_text: str = Field(min_length=40, max_length=20000)


class VoiceProfileExtractResult(BaseModel):
    """A proposed VoiceProfile draft — never persisted by itself. The caller
    reviews/edits the fields and still submits them through the normal
    ``POST /brand/profile`` to actually save a profile."""

    title: str | None = None
    tone_descriptors: list[str] = Field(default_factory=list)
    authority_topics: list[str] = Field(default_factory=list)
    forbidden_phrases: list[str] = Field(default_factory=list)
    preferred_cta: str | None = None
    bio_summary: str | None = None
    generated_by: Literal["llm", "heuristic"]
    model_used: str | None = None


class BrandVoicePreviewRequest(BaseModel):
    """A topic to generate a side-by-side sample for — generic AI output vs.
    this org's own VoiceProfile applied to the same topic."""

    topic: str = Field(min_length=3, max_length=300)


class BrandVoicePreviewResult(BaseModel):
    """Two short samples on the same topic: what a generic AI tool would
    write, and what this org's configured voice actually changes about it.
    Nothing here is persisted — this is a live, on-demand comparison."""

    topic: str
    generic_version: str
    branded_version: str
    generated_by: Literal["llm", "template"]
    model_used: str | None = None


class BrandFragmentCreate(BaseModel):
    content: str = Field(min_length=10, max_length=5000)
    category: str = Field(description="BrandFragmentCategory value")
    tags: list[str] = Field(default_factory=list)
    source: str | None = None
    performance_score: float | None = Field(default=None, ge=0, le=100)


class BrandFragmentOut(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    content: str
    category: str
    tags: list[str]
    source: str | None
    performance_score: float | None
    used_count: int
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BrandContextQuery(BaseModel):
    """Query the PersonalBrandService for relevant context."""

    query: str = Field(description="The topic or content we need brand context for")
    top_k: int = Field(default=5, ge=1, le=20)
    category_filter: str | None = None
    tag_filter: list[str] = Field(default_factory=list)


class BrandContextResult(BaseModel):
    """The enriched brand context returned for a query."""

    voice_profile: VoiceProfileOut | None
    relevant_fragments: list[BrandFragmentOut]
    brand_brief: str = Field(description="Natural-language brief injected into AI prompts")
    fragment_count_total: int
