"""Shared model primitives.

Common columns (identifiers, timestamps) and enumerations live here so every
entity stays consistent (DRY) and future cross-cutting concerns — soft deletes,
audit fields, multi-tenancy — can be added in one place.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp factory used for default column values."""
    return datetime.now(UTC)


class TimestampMixin(SQLModel):
    """Mixin adding ``created_at`` / ``updated_at`` audit columns."""

    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=utcnow, nullable=False)


def new_uuid() -> uuid.UUID:
    """UUID primary-key factory.

    UUIDs are used instead of auto-increment integers so identifiers are
    non-guessable and can be generated client-side or across shards without
    coordination — useful for a distributed, integration-heavy platform.
    """
    return uuid.uuid4()


class LeadStatus(str, Enum):
    """Lifecycle stages of a lead within the sales intelligence pipeline."""

    NEW = "new"
    QUALIFIED = "qualified"
    ENGAGED = "engaged"
    CONVERTED = "converted"
    DISQUALIFIED = "disqualified"


class SignalType(str, Enum):
    """Canonical categories of market/intent signals.

    New analyzers classify raw payloads into one of these types. The enum is the
    shared vocabulary between the ingestion layer, the analyzers, and the UI.
    """

    FUNDING_ROUND = "funding_round"
    HIRING = "hiring"
    TECH_ADOPTION = "tech_adoption"
    LEADERSHIP_CHANGE = "leadership_change"
    PRODUCT_LAUNCH = "product_launch"
    ENGAGEMENT = "engagement"  # e.g. website visit, content download
    NEWS_MENTION = "news_mention"
    EXPANSION = "expansion"  # new office, new market
    OTHER = "other"


class SignalSource(str, Enum):
    """Where a signal originated from."""

    WEBHOOK = "webhook"
    MANUAL = "manual"
    CRAWLER = "crawler"
    CRM = "crm"
    ENRICHMENT = "enrichment"


class OpportunityStatus(str, Enum):
    """Lifecycle of a detected opportunity."""

    DETECTED = "detected"
    PRIORITIZED = "prioritized"
    IN_PROGRESS = "in_progress"
    WON = "won"
    LOST = "lost"
    DISMISSED = "dismissed"
