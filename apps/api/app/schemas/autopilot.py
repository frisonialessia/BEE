"""Schemas for AutopilotConfig — per-organization autonomous-execution guardrails."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class AutopilotConfigIn(BaseModel):
    """Replaces the org's autopilot config wholesale — same "replace, don't
    patch" convention as VoiceProfileCreate/TeamProfileIn."""

    enabled: bool = False
    confidence_threshold: float = Field(default=0.9, ge=0.5, le=1.0)
    excluded_company_ids: list[uuid.UUID] = Field(default_factory=list, max_length=1000)
    forbidden_words: list[str] = Field(default_factory=list, max_length=200)


class AutopilotConfigOut(BaseModel):
    """Deliberately no id/timestamps — same minimalism as ICPCriteriaOut.
    "Never configured" and "configured with every field at its default"
    read identically (enabled=False, threshold=0.9, both lists empty),
    exactly like ICPCriteriaOut's "empty lists = not configured yet"."""

    enabled: bool
    confidence_threshold: float
    excluded_company_ids: list[str]
    forbidden_words: list[str]

    model_config = {"from_attributes": True}
