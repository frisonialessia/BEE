"""Pydantic schemas (DTOs) for the Lead read API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.base import LeadStatus

# The initial pipeline stage a rep can pick for the Opportunity created
# alongside a lead (see LeadCreateIn.pipeline_stage / POST /leads). Deliberately
# excludes ready_to_action, won, lost, and dismissed — ready_to_action is an
# earned state (StrategyGeneratorService promotes an opportunity there once
# its battlecard is complete, never picked by hand, same gate
# PATCH /opportunities/{id}/stage already enforces), and the closed
# statuses are only ever reached through a dedicated close action.
LEAD_PIPELINE_STAGES: tuple[str, ...] = ("detected", "prioritized", "in_progress")


class LeadCreateIn(BaseModel):
    """Manual lead creation — the CSV/manual-entry path, not signal ingestion."""

    full_name: str = Field(min_length=1, max_length=255)
    company_id: uuid.UUID | None = None
    email: str | None = Field(default=None, max_length=255)
    title: str | None = Field(default=None, max_length=255)
    seniority: str | None = Field(default=None, max_length=64)
    linkedin_url: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=64)

    # ----- Deal context — all optional, none change today's behavior when
    # left unset ------------------------------------------------------------
    estimated_value: float | None = Field(default=None, ge=0)
    source: str | None = Field(default=None, max_length=128)
    next_meeting_at: datetime | None = None
    photo_url: str | None = Field(default=None, max_length=300_000)

    # ----- Pipeline placement + AI, both opt-in ----------------------------
    # Unset (the default): the lead is saved as a plain contact, same as
    # today — no Opportunity is created at all.
    # Set: an Opportunity is created in this stage, seeded with
    # estimated_value as its `amount`.
    pipeline_stage: Literal["detected", "prioritized", "in_progress"] | None = None
    # Optional context fed to StrategyGeneratorService the same way a
    # manually-created Opportunity's own `description` already is (see
    # POST /opportunities) — filling this in is what triggers the AI
    # battlecard generation; leaving it blank saves straight to
    # `pipeline_stage` with no AI call at all. Only meaningful when
    # `pipeline_stage` is also set — ignored otherwise, since there's no
    # Opportunity for a strategy to attach to.
    ai_context: str | None = Field(default=None, max_length=4000)


class LeadBulkCreateIn(BaseModel):
    """Bulk import — the CSV path. Parsing happens client-side; this just
    takes the already-parsed rows so the backend stays format-agnostic.

    Rows are intentionally untyped (``dict``, not ``LeadCreateIn``) at this
    layer: FastAPI validates the request body — including every item in a
    typed list — before the endpoint body ever runs, so one row failing
    ``LeadCreateIn``'s field constraints (e.g. an empty ``full_name``) would
    422 the *entire* request, discarding every valid row alongside it. The
    endpoint instead validates each row against ``LeadCreateIn`` itself,
    inside its existing per-row try/except, so a bad row is reported and
    skipped like any other row-level failure instead of aborting the batch.
    """

    leads: list[dict[str, Any]] = Field(min_length=1, max_length=1000)


class LeadBulkError(BaseModel):
    row: int
    message: str


class LeadBulkResult(BaseModel):
    created_count: int
    errors: list[LeadBulkError]


class LeadImportRow(BaseModel):
    """One row of an external prospect list (the CSV/XLSX import template).

    Unlike :class:`LeadCreateIn`, the company is identified by name/domain —
    not by an internal ``company_id`` the uploader can't possibly have — and
    resolved with the same get-or-create logic
    :class:`~app.repositories.company.CompanyRepository` already uses for
    signal ingestion (``company_name``/``company_domain`` preferred, falling
    back to name). ``full_name`` is optional at this layer, same contract as
    :class:`app.schemas.signal.LeadRef` — a row with neither a name nor an
    email has nothing to key a lead on and is skipped, not errored (the
    template's own header naming makes ``full_name`` the one column the
    frontend actually requires before letting a row through, but this
    endpoint doesn't assume every caller is that upload form).
    """

    full_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    title: str | None = Field(default=None, max_length=255)
    seniority: str | None = Field(default=None, max_length=64)
    linkedin_url: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=255)
    company_domain: str | None = Field(default=None, max_length=255)
    company_industry: str | None = Field(default=None, max_length=255)
    company_country: str | None = Field(default=None, max_length=255)


class LeadImportIn(BaseModel):
    """Bulk import from an external prospect list — the template-driven path.

    Rows are untyped (``dict``, not ``LeadImportRow``) for the same reason
    as ``LeadBulkCreateIn.leads`` — a request-body-level ``list[LeadImportRow]``
    would let one row exceeding a ``max_length`` constraint 422 the whole
    file instead of just that row. The endpoint validates each row against
    ``LeadImportRow`` inside its own per-row try/except.
    """

    rows: list[dict[str, Any]] = Field(min_length=1, max_length=1000)


class LeadImportRowOutcome(BaseModel):
    """What happened to one imported row — never silently swallowed."""

    row: int
    status: str = Field(description="'created' | 'matched_existing' | 'error'")
    lead_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    message: str | None = None


class LeadImportResult(BaseModel):
    """Honest summary of an import run — counts only ever reflect what the
    database actually did, never an assumption. A row that matched an
    existing lead by email is reported as matched, not created — the
    dataset was not fabricated as "new" just because it was in the file.
    """

    total_rows: int
    leads_created: int
    leads_matched: int
    companies_created: int
    companies_matched: int
    skipped: int = Field(description="Rows with no usable full_name — nothing to import")
    rows: list[LeadImportRowOutcome]


class LeadBulkUpdateIn(BaseModel):
    """Bulk action from the leads directory — reassign or change status for
    several leads at once, without a round trip per row. Only the fields
    actually sent are applied (``exclude_unset`` at the call site)."""

    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    status: LeadStatus | None = None
    assigned_to_user_id: uuid.UUID | None = None


class LeadBulkUpdateResult(BaseModel):
    updated_count: int
    errors: list[LeadBulkError]


class LeadOut(BaseModel):
    """API representation of a persisted lead."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID | None
    organization_id: uuid.UUID | None
    assigned_to_user_id: uuid.UUID | None
    full_name: str
    email: str | None
    title: str | None
    seniority: str | None
    linkedin_url: str | None
    phone: str | None
    status: LeadStatus
    score: float
    attributes: dict[str, Any]
    created_at: datetime
    # Populated by DataValidator — see app.services.data_validator.
    data_freshness_score: float
    validation_flags: list[str]
    last_validated_at: datetime | None
    stale_risk: bool

    estimated_value: float | None
    source: str | None
    next_meeting_at: datetime | None
    meetings_held_count: int
    photo_url: str | None


class LeadValidationOut(BaseModel):
    """Result of an on-demand DataValidator run against one lead."""

    lead_id: uuid.UUID
    flags: list[str]
    freshness_score: float
    stale_risk: bool
    validated_at: datetime
