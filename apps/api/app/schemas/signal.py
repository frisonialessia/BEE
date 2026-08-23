"""Pydantic schemas (DTOs) for the Signal Engine API.

These models define the *external* contract of the API and are intentionally
decoupled from the SQLModel persistence models. This separation (Interface
Segregation / Single Responsibility) lets the wire format evolve independently
of the database schema and shields internal fields from clients.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.base import (
    OpportunityStatus,
    SignalSource,
    SignalType,
)


class CompanyRef(BaseModel):
    """Lightweight company reference embedded in an inbound signal.

    The webhook does not require the company to pre-exist. BEE performs
    get-or-create resolution using ``domain`` (preferred) or ``name``.
    """

    name: str | None = None
    domain: str | None = None
    industry: str | None = None
    country: str | None = None


class LeadRef(BaseModel):
    """Lightweight lead reference embedded in an inbound signal."""

    full_name: str | None = None
    email: str | None = None
    title: str | None = None
    seniority: str | None = None
    linkedin_url: str | None = None


class SignalWebhookIn(BaseModel):
    """Inbound webhook payload for the Signal Engine.

    This is the canonical envelope external integrations POST to
    ``/api/v1/signals/webhook``. Only ``title`` and ``event`` are strictly
    required; everything else enriches classification and entity resolution.
    """

    model_config = ConfigDict(extra="allow")  # tolerate provider-specific extras

    # Human-readable summary of what happened.
    title: str = Field(..., min_length=1, examples=["Acme raised a $20M Series B"])
    # Raw event/trigger label from the source; analyzers map it to a SignalType.
    event: str = Field(..., examples=["funding.round.announced"])
    description: str | None = None

    # Optional pre-classified type; analyzers may override/confirm it.
    signal_type: SignalType | None = None
    source: SignalSource = SignalSource.WEBHOOK

    # Optional idempotency key from the provider (provider name + external id).
    external_id: str | None = None
    detected_at: datetime | None = None

    company: CompanyRef | None = None
    lead: LeadRef | None = None

    # Arbitrary structured data from the provider, preserved verbatim.
    data: dict[str, Any] = Field(default_factory=dict)


class SignalOut(BaseModel):
    """API representation of a persisted signal."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    signal_type: SignalType
    source: SignalSource
    title: str
    description: str | None
    score: float
    confidence: float
    detected_at: datetime
    company_id: uuid.UUID | None
    lead_id: uuid.UUID | None
    analysis: dict[str, Any]


class OpportunityOut(BaseModel):
    """API representation of a generated opportunity."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: OpportunityStatus
    score: float
    strategy: dict[str, Any]
    signal_id: uuid.UUID | None
    lead_id: uuid.UUID | None
    company_id: uuid.UUID | None
    # Exposed for the frontend rep leaderboard — was already tracked on the
    # model (permissions filtering reads it) but never returned to clients.
    assigned_to_user_id: uuid.UUID | None = None
    # Forecasting & MEDDIC qualification — see app.models.opportunity.
    amount: float | None = None
    expected_close_date: date | None = None
    qualification: dict[str, bool] = Field(default_factory=dict)


class OpportunityUpdateIn(BaseModel):
    """Partial update for forecasting/qualification fields.

    Every field is optional and only the ones actually present in the request
    body are applied (``exclude_unset`` at the call site) — sending
    ``{"amount": 5000}`` never clobbers ``expected_close_date`` or
    ``qualification`` set by a previous call.
    """

    amount: float | None = None
    expected_close_date: date | None = None
    qualification: dict[str, bool] | None = None


class SignalIngestResult(BaseModel):
    """Response returned after processing an inbound webhook.

    Bundles the persisted signal, any opportunity that was generated, the
    analyzers that contributed, and whether the battlecard was fully enriched —
    so integrators have complete observability into how their payload was
    interpreted and what state the opportunity is in.
    """

    signal: SignalOut
    opportunity: OpportunityOut | None = None
    analyzers_applied: list[str] = Field(default_factory=list)
    strategy_enriched: bool = False
    message: str = "Signal ingested"
