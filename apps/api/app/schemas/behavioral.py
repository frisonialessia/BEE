"""Schemas for the BehavioralCollector endpoint.

``BuyingIntentEvent`` is the input contract for ``POST /api/v1/signals/intent``.
It describes a behavioral event from the lead's digital footprint — a page visit,
resource download, demo request, or any other in-product or marketing action that
signals purchase intent.

Design rationale
----------------
The BehavioralCollector reuses the ``SignalEngine`` to avoid duplicating the
ingestion, scoring, and enrichment pipeline. Under the hood, it translates a
``BuyingIntentEvent`` into a standard ``SignalWebhookIn`` with:

* ``signal_type = ENGAGEMENT``
* ``source = BEHAVIORAL``
* ``score`` computed from the event type's baseline intent score

If an existing open opportunity exists for the company/lead, it is hot-flagged
in the strategy field (``hot_lead: true``, ``urgency: immediate``). This makes
the CEO dashboard surface the lead at the top of the queue with a "🔥 HOT" badge.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.models.base import BehavioralEventType

# Baseline intent scores per event type (0-100).
# These are multiplied by the signal score in the engine.
EVENT_INTENT_SCORES: dict[str, float] = {
    BehavioralEventType.PRICING_VIEW: 92.0,
    BehavioralEventType.DEMO_REQUEST: 95.0,
    BehavioralEventType.PRODUCT_TRIAL: 90.0,
    BehavioralEventType.RESOURCE_DOWNLOAD: 72.0,
    BehavioralEventType.WEBINAR_ATTENDANCE: 68.0,
    BehavioralEventType.REPEAT_VISIT: 75.0,
    BehavioralEventType.CASE_STUDY_VIEW: 65.0,
    BehavioralEventType.PAGE_VISIT: 45.0,
}


class BuyingIntentEvent(BaseModel):
    """A buying-intent behavioral event from a tracked lead.

    This is the input to the BehavioralCollector.  All fields are optional
    except ``event_type`` — BEE does its best to match the event to an
    existing opportunity using whatever identifiers are provided.
    """

    event_type: BehavioralEventType = Field(
        description="The type of behavioral event that occurred."
    )

    # ── Lead identifiers (at least one recommended) ──────────────────────────
    lead_email: str | None = Field(default=None, description="Email of the lead")
    company_domain: str | None = Field(
        default=None,
        description="Domain of the company (e.g. 'acme.com')",
    )

    # ── Event context ─────────────────────────────────────────────────────────
    page_url: str | None = Field(
        default=None,
        description="URL visited (for PAGE_VISIT events)",
    )
    resource_name: str | None = Field(
        default=None,
        description="Name of downloaded resource or attended webinar",
    )
    session_duration_seconds: int | None = Field(
        default=None,
        description="Time spent on page (enriches score calculation)",
    )
    visit_count: int | None = Field(
        default=None,
        description="Number of visits in this session window (for REPEAT_VISIT)",
    )

    # ── Pass-through metadata for auditing ───────────────────────────────────
    metadata: dict[str, Any] = Field(default_factory=dict)


class IntentEventResult(BaseModel):
    """Response from the BehavioralCollector endpoint."""

    signal_id: str
    opportunity_id: str | None = None
    hot_lead: bool = False
    score: float
    message: str
