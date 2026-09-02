"""Lead entity.

A Lead is a person of interest at a Company (a decision-maker, champion, or
influencer). Signals and opportunities can be associated with a specific lead
when the intelligence is person-level rather than company-level.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import LeadStatus, TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover
    from app.models.company import Company
    from app.models.opportunity import Opportunity
    from app.models.signal import Signal


class Lead(TimestampMixin, table=True):
    """A contact/person tied to a company."""

    __tablename__ = "leads"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    company_id: uuid.UUID | None = Field(
        default=None, foreign_key="companies.id", index=True
    )
    # Tenant boundary. Nullable for backward compatibility with data ingested
    # before multi-tenancy existed — see app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    # The rep this lead is assigned to — drives manager/member visibility
    # scoping (see app.services.permissions).
    assigned_to_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="users.id", index=True
    )

    full_name: str = Field(nullable=False)
    email: str | None = Field(default=None, index=True)
    title: str | None = Field(default=None)
    # Coarse seniority (e.g. "c_level", "vp", "manager") used for prioritization.
    seniority: str | None = Field(default=None, index=True)
    linkedin_url: str | None = Field(default=None)
    phone: str | None = Field(default=None)

    status: LeadStatus = Field(default=LeadStatus.NEW, index=True)
    # Composite intent/fit score maintained by the intelligence layer (0-100).
    score: float = Field(default=0.0)

    # ----- Deal context (set at manual creation, editable after) --------------
    # Estimated value of what this lead could buy — same field name/shape as
    # Opportunity.amount, kept separate rather than requiring an Opportunity
    # to exist just to record a number a rep already knows on first contact.
    # If an Opportunity IS created alongside this lead (see POST /leads'
    # pipeline_stage), its own `amount` is seeded from this value.
    estimated_value: float | None = Field(default=None)
    # Where this lead came from — free text, not an enum: "referido",
    # "evento", "outbound", whatever the org's own vocabulary is, without a
    # migration every time a new source shows up.
    source: str | None = Field(default=None, max_length=128)
    next_meeting_at: datetime | None = Field(default=None)
    # Incremented by hand from the lead's detail view each time a meeting
    # happens — no calendar integration to derive this from yet (see
    # OpportunityTask for the closest existing thing, a due-date checklist
    # item, not a meeting log).
    meetings_held_count: int = Field(default=0)
    # Client-resized `data:image/...;base64,...` URI — same storage
    # approach as User.avatar_url (see that field's own docstring): no blob
    # storage wired up yet, so the picture lives in the row itself, already
    # downscaled client-side before it ever reaches this API.
    photo_url: str | None = Field(default=None, max_length=300_000)

    attributes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ----- DataValidator fields -----------------------------------------------
    # Populated by DataValidator.validate_lead() — async background audits.
    data_freshness_score: float = Field(default=1.0)  # 0-1; lower = staler data
    validation_flags: list[str] = Field(
        default_factory=list, sa_column=Column(JSON)
    )  # e.g. ["email_invalid", "stale_title", "linkedin_unreachable"]
    last_validated_at: datetime | None = Field(default=None)
    stale_risk: bool = Field(default=False, index=True)  # true when data > 90 days old

    # ----- Relationships -------------------------------------------------------
    company: "Company" = Relationship(back_populates="leads")
    signals: list["Signal"] = Relationship(back_populates="lead")
    opportunities: list["Opportunity"] = Relationship(back_populates="lead")
