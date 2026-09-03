"""Pydantic schemas (DTOs) for the Signal Engine API.

These models define the *external* contract of the API and are intentionally
decoupled from the SQLModel persistence models. This separation (Interface
Segregation / Single Responsibility) lets the wire format evolve independently
of the database schema and shields internal fields from clients.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.base import (
    OPPORTUNITY_TYPES,
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
    # Revenue Continuity Radar — "new_logo" | "expansion" | "renewal_risk".
    # See app.models.base.OPPORTUNITY_TYPES and RevenueContinuityService.
    opportunity_type: str = "new_logo"
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
    # Deal context captured at manual creation — see app.models.opportunity.
    source: str | None = None
    next_meeting_at: datetime | None = None
    meetings_held_count: int = 0
    photo_url: str | None = None
    # Needed for trend/cohort BI (created_at) — was tracked on the model
    # (TimestampMixin) but never returned to clients.
    created_at: datetime
    updated_at: datetime
    # Win/Loss Analysis — set once by FeedbackLoopService.record_outcome when
    # status first transitions to WON/LOST. See app.models.opportunity.
    loss_reason: str | None = None
    competitor: str | None = None
    closed_at: datetime | None = None


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


class OpportunityStageIn(BaseModel):
    """Move an opportunity between pipeline stages — the CRM Kanban drag.

    Deliberately restricted to the four non-terminal stages. WON/LOST/
    DISMISSED carry business logic (loss reason, competitor, the feedback
    loop, vector-store seeding — see ``FeedbackLoopService.record_outcome``)
    that a plain drag-and-drop must never bypass; closing a deal stays a
    dedicated action, not a Kanban column.
    """

    status: Literal["detected", "ready_to_action", "prioritized", "in_progress"]


class OpportunityCreateIn(BaseModel):
    """Manual opportunity creation — the CRM "+ Nueva oportunidad" counterpart
    to ``SignalEngine._create_opportunity`` (which only runs during signal
    ingestion). A rep adding an account to the pipeline by hand instead of
    waiting for an inbound signal.

    Company/lead fields are flat (``company_name``/``lead_full_name``, not a
    nested ref or an id) for the same reason ``LeadImportRow`` is: the caller
    (a browser form) doesn't have — and shouldn't need — an internal
    ``company_id``/``lead_id`` before the account exists yet. They're resolved
    with the same get-or-create logic signal ingestion already uses
    (``CompanyRepository``/``LeadRepository.get_or_create_from_ref``), so
    submitting a company name/domain that already exists in this organization
    attaches to that row instead of creating a duplicate.

    ``description`` is the rep's own account of why this is worth pursuing —
    it becomes the synthesized signal's description and is what the strategy
    generators read as market context, same as an inbound webhook's payload
    would be.
    """

    # Either an existing account (``company_id``, picked from Empresas) or
    # the fields to resolve-or-create one — the form offers both, so a rep
    # never types a company BEE already tracks. Same for the contact below.
    company_id: uuid.UUID | None = None
    company_name: str | None = Field(default=None, max_length=255)
    company_domain: str | None = Field(default=None, max_length=255)
    company_industry: str | None = Field(default=None, max_length=255)
    company_country: str | None = Field(default=None, max_length=255)

    lead_id: uuid.UUID | None = None
    lead_full_name: str | None = Field(default=None, max_length=255)
    lead_email: str | None = Field(default=None, max_length=255)
    lead_title: str | None = Field(default=None, max_length=255)
    lead_seniority: str | None = Field(default=None, max_length=64)
    lead_linkedin_url: str | None = Field(default=None, max_length=500)

    signal_type: SignalType = SignalType.OTHER
    title: str | None = Field(default=None, max_length=255)
    description: str = Field(min_length=1, max_length=2000)
    # Rep's own priority estimate (0-100) — same scale as an analyzer-assigned
    # signal score, seeding both the synthesized signal's and the
    # opportunity's score until real signals or outcomes recalibrate it.
    score: float = Field(default=50.0, ge=0, le=100)

    # ----- Deal context (optional, parity with LeadCreateIn) --------------------
    amount: float | None = Field(default=None, ge=0)
    source: str | None = Field(default=None, max_length=100)
    next_meeting_at: datetime | None = None
    meetings_held_count: int | None = Field(default=None, ge=0)
    photo_url: str | None = Field(default=None, max_length=300_000)

    # ----- Deal shape (optional) ---------------------------------------------
    # Who works it (defaults to the caller), where it starts, when it should
    # close and what kind of revenue it is — the fields a CRM asks for up
    # front so Forecast, Ranking and the Bandeja have something to rank on
    # from day one instead of after a later edit.
    assigned_to_user_id: uuid.UUID | None = None
    # Only the stages a person can legitimately *start* a deal in. READY_TO_
    # ACTION is BEE's own gate (a complete battlecard) and never set by hand.
    status: Literal["detected", "prioritized", "in_progress"] | None = None
    expected_close_date: date | None = None
    opportunity_type: str | None = Field(default=None, max_length=32)

    @field_validator("opportunity_type")
    @classmethod
    def _known_opportunity_type(cls, value: str | None) -> str | None:
        if value is not None and value not in OPPORTUNITY_TYPES:
            raise ValueError(f"opportunity_type must be one of {sorted(OPPORTUNITY_TYPES)}")
        return value

    @model_validator(mode="after")
    def _company_identified(self) -> OpportunityCreateIn:
        if self.company_id is None and not (self.company_name or "").strip():
            raise ValueError("Either company_id or company_name is required.")
        return self


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
