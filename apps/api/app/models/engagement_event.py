"""IncomingEngagementEvent — models for the SmartEngagementEngine.

These models capture external engagement events (comments on CEO posts, DMs,
mentions) that BEE's SmartEngagementEngine processes to generate contextual
response drafts.

Authenticity gate
-----------------
Every generated response draft is stored as a PendingAction in the
AgentOrchestrator before anything is dispatched. The CEO always reads
and approves before sending. This is a hard architectural constraint.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class EngagementSource(str):
    LINKEDIN = "linkedin"
    TWITTER = "twitter"
    EMAIL = "email"
    SLACK = "slack"
    OTHER = "other"


class EngagementSentiment(str):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"
    QUESTION = "question"
    UNKNOWN = "unknown"


class EngagementIntent(str):
    SALES_INTEREST = "sales_interest"     # They might buy
    OBJECTION = "objection"               # Pushback on a claim
    REFERRAL = "referral"                 # They're recommending someone
    FOLLOW_UP = "follow_up"               # Continuing a conversation
    COMPLIMENT = "compliment"             # Positive feedback, not a lead
    SPAM = "spam"                         # Ignore
    OTHER = "other"


class IncomingEngagementEvent(TimestampMixin, table=True):
    """A captured external engagement event requiring the CEO's attention.

    Stored after SmartEngagementEngine processes it and BEFORE a response
    is sent. The response draft is attached to the matching PendingAction.
    """

    __tablename__ = "incoming_engagement_events"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # ── Source ────────────────────────────────────────────────────────────────
    source: str = Field(index=True, description="Platform: linkedin | twitter | email")
    source_event_id: str | None = Field(default=None, unique=True, description="Native event ID from the platform")
    author_name: str | None = Field(default=None)
    author_handle: str | None = Field(default=None, description="e.g. @johndoe on Twitter")
    author_profile_url: str | None = Field(default=None)

    # ── Content ───────────────────────────────────────────────────────────────
    content: str = Field(nullable=False, description="The raw text of the comment/DM/mention.")
    context_post: str | None = Field(
        default=None,
        description="The CEO's original post this event is responding to (for context).",
    )

    # ── Analysis (set by SmartEngagementEngine) ───────────────────────────────
    sentiment: str = Field(default=EngagementSentiment.UNKNOWN, index=True)
    intent: str = Field(default=EngagementIntent.OTHER, index=True)
    analysis_confidence: float = Field(default=0.0, description="0-1 confidence in sentiment/intent classification.")
    analysis_notes: str | None = Field(default=None, description="Reasoning for the classification.")

    # ── Generated response ────────────────────────────────────────────────────
    response_draft: str | None = Field(default=None, description="Draft response generated using PersonalBrandService.")
    pending_action_id: uuid.UUID | None = Field(
        default=None,
        description="FK to PendingAction that holds the response for CEO approval.",
    )

    # ── Processing status ─────────────────────────────────────────────────────
    processed: bool = Field(default=False, index=True)
    ignored: bool = Field(default=False, description="True if classified as spam or low priority.")

    # ── Raw payload ───────────────────────────────────────────────────────────
    raw_payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
