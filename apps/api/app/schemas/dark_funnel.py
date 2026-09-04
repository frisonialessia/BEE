"""Schemas for the DarkFunnelService API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DarkFunnelSignalIn(BaseModel):
    """Ingest a single dark funnel intent signal."""

    company_domain: str = Field(description="The domain of the company showing buying intent (e.g. 'techcorp.com')")
    company_name: str | None = None
    signal_type: str = Field(description="One of DarkSignalType values")
    source_platform: str | None = Field(default=None, description="e.g. 'g2', 'website', 'linkedin'")
    content_url: str | None = None
    intent_keywords: list[str] = Field(default_factory=list)
    anonymous: bool = True
    contact_role: str | None = None
    lead_id: uuid.UUID | None = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    external_id: str | None = Field(
        default=None,
        description="Upstream event id, when the source provides one — lets ingest_signal "
        "dedupe a retried/replayed webhook delivery instead of double-counting it.",
    )


class DarkFunnelSignalOut(BaseModel):
    id: uuid.UUID
    company_domain: str
    company_name: str | None
    signal_type: str
    source_platform: str | None
    intent_keywords: list[str]
    anonymous: bool
    weight: float
    processed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class HotLeadOut(BaseModel):
    """A company in active research mode, surfaced by DarkFunnelService."""

    id: uuid.UUID
    company_domain: str
    company_name: str | None
    lead_id: uuid.UUID | None
    research_intensity_score: float = Field(description="0-100 composite intent score")
    buying_stage: str = Field(description="awareness | consideration | decision | ready_to_buy")
    signal_count: int
    signal_types_seen: list[str]
    top_intent_keywords: list[str]
    last_signal_at: datetime | None
    is_hot: bool
    hot_since: datetime | None
    alerted: bool
    # A person's override from the hive; None means "as BEE computed it".
    manual_temperature: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HotLeadTemperatureIn(BaseModel):
    """Set (0-100) or clear (null) the manual temperature of a hot lead."""

    manual_temperature: float | None = Field(default=None, ge=0, le=100)


class DarkFunnelSummary(BaseModel):
    """Overview of the dark funnel pipeline."""

    total_signals_today: int
    total_hot_leads: int
    ready_to_buy_count: int
    decision_stage_count: int
    consideration_stage_count: int
    new_signals_today: int
    top_intent_signals: list[str]
