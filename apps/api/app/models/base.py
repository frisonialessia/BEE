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
    BEHAVIORAL = "behavioral"  # BehavioralCollector intent events


class BehavioralEventType(str, Enum):
    """Types of buying-intent events the BehavioralCollector processes.

    These translate directly to ENGAGEMENT signals and can hot-flag an
    existing opportunity when the lead shows high-value intent behavior.
    """

    PAGE_VISIT = "page_visit"           # visited a tracked page (e.g. /pricing)
    RESOURCE_DOWNLOAD = "resource_download"  # downloaded a whitepaper / demo
    DEMO_REQUEST = "demo_request"       # explicitly requested a demo
    PRICING_VIEW = "pricing_view"       # viewed pricing (strongest intent signal)
    CASE_STUDY_VIEW = "case_study_view"
    WEBINAR_ATTENDANCE = "webinar_attendance"
    PRODUCT_TRIAL = "product_trial"     # started a free trial
    REPEAT_VISIT = "repeat_visit"       # returned ≥ 3 times in 7 days


class ActionStatus(str, Enum):
    """State machine for AgentOrchestrator pending actions.

    Security principle: every external action (email send, CRM update) MUST
    pass through PENDING_APPROVAL before any execution can begin. There is no
    shortcut from creation to EXECUTING — a human (or an explicit API call)
    must approve each action first.

    State machine::

        PENDING_APPROVAL ──► APPROVED ──► EXECUTING ──► COMPLETED
               │                │                │
               ▼                ▼                ▼
           REJECTED           (wait)           FAILED ──► PENDING_APPROVAL (retry)
    """

    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"


class ActionType(str, Enum):
    """Type of execution action the orchestrator manages."""

    SEND_EMAIL = "send_email"
    BOOK_MEETING = "book_meeting"
    CRM_UPDATE = "crm_update"
    SLACK_NOTIFY = "slack_notify"
    LINKEDIN_MESSAGE = "linkedin_message"
    WEBHOOK_CALL = "webhook_call"


class InsightType(str, Enum):
    """Categories of market insights detected by the TrendAnalyst."""

    VOLUME_SPIKE = "volume_spike"          # unusual signal volume for a type/industry
    SECTOR_MOMENTUM = "sector_momentum"    # many companies in an industry show same signal
    EMERGING_PATTERN = "emerging_pattern"  # new signal type appearing more frequently
    COMPETITIVE_CLUSTER = "competitive_cluster"  # competitor activity surge
    SEASONAL_TREND = "seasonal_trend"      # recurring cyclical pattern


class VariantStatus(str, Enum):
    """Lifecycle of a tactic A/B variant."""

    ACTIVE = "active"       # collecting data
    PAUSED = "paused"       # temporarily stopped
    CONCLUDED = "concluded" # winner declared, variant archived


class OpportunityStatus(str, Enum):
    """Lifecycle of a detected opportunity.

    State machine::

        DETECTED ──► READY_TO_ACTION ──► IN_PROGRESS ──► WON
                            │                 │
                            ▼                 ▼
                        PRIORITIZED        LOST / DISMISSED

    ``READY_TO_ACTION`` is the gate that the StrategyGeneratorService controls.
    An opportunity may not reach this state until the ``strategy`` field has been
    fully enriched (pain_point, closing_argument, timing_window all present). This
    guarantees the battlecard is complete before it surfaces to the salesperson.
    """

    DETECTED = "detected"
    READY_TO_ACTION = "ready_to_action"
    PRIORITIZED = "prioritized"
    IN_PROGRESS = "in_progress"
    WON = "won"
    LOST = "lost"
    DISMISSED = "dismissed"
