"""Lead entity.

A Lead is a person of interest at a Company (a decision-maker, champion, or
influencer). Signals and opportunities can be associated with a specific lead
when the intelligence is person-level rather than company-level.
"""

import uuid
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

    attributes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ----- Relationships -------------------------------------------------------
    company: "Company" = Relationship(back_populates="leads")
    signals: list["Signal"] = Relationship(back_populates="lead")
    opportunities: list["Opportunity"] = Relationship(back_populates="lead")
