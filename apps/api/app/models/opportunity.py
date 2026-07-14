"""Opportunity (Oportunidad) entity.

An Opportunity is the actionable core of BEE: it connects a **lead** + a
**signal** + a **strategy** (the recommended play to act on the signal). This is
where raw market intelligence becomes an executable sales motion.

The ``strategy`` field is intentionally a structured JSON document so the future
AI layer can populate rich, evolving playbooks (recommended messaging, channel,
timing, next best action) without further schema migrations.
"""

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import OpportunityStatus, TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover
    from app.models.company import Company
    from app.models.lead import Lead
    from app.models.signal import Signal


class Opportunity(TimestampMixin, table=True):
    """A prioritized sales opportunity linking lead + signal + strategy."""

    __tablename__ = "opportunities"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # The three pillars of an opportunity. ``signal_id`` is the originating
    # trigger; ``lead_id``/``company_id`` are the target of the play.
    signal_id: uuid.UUID | None = Field(
        default=None, foreign_key="signals.id", index=True
    )
    lead_id: uuid.UUID | None = Field(default=None, foreign_key="leads.id", index=True)
    company_id: uuid.UUID | None = Field(
        default=None, foreign_key="companies.id", index=True
    )

    title: str = Field(nullable=False)
    status: OpportunityStatus = Field(default=OpportunityStatus.DETECTED, index=True)

    # Priority score (0-100) used to rank opportunities in the pipeline.
    score: float = Field(default=0.0, index=True)

    # The recommended play. Free-form now, AI-generated later. Example shape:
    # {"next_best_action": "...", "channel": "email", "message": "...",
    #  "rationale": "...", "playbook": "founder_led_outreach"}
    strategy: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ----- Relationships -------------------------------------------------------
    signal: "Signal" = Relationship(back_populates="opportunities")
    lead: "Lead" = Relationship(back_populates="opportunities")
    company: "Company" = Relationship(back_populates="opportunities")
