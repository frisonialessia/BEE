"""Signal (Señal) entity.

A Signal is a discrete, timestamped piece of market intelligence — a "trigger"
that may indicate buying intent or a sales opening (a funding round, a key hire,
a technology adoption, an engagement event...). Signals are the raw material the
Signal Engine ingests, classifies, and scores.

The full original payload is always preserved (``raw_payload``) so that new
analyzers — including future AI models — can re-process historical signals
without data loss.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import (
    SignalSource,
    SignalType,
    TimestampMixin,
    new_uuid,
    utcnow,
)

if TYPE_CHECKING:  # pragma: no cover
    from app.models.company import Company
    from app.models.lead import Lead
    from app.models.opportunity import Opportunity


class Signal(TimestampMixin, table=True):
    """A single detected market/intent signal."""

    __tablename__ = "signals"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # A signal may be about a company, a specific lead, or both. Both FKs are
    # optional so ingestion never blocks on entity resolution — linking can be
    # enriched asynchronously later.
    company_id: uuid.UUID | None = Field(
        default=None, foreign_key="companies.id", index=True
    )
    lead_id: uuid.UUID | None = Field(default=None, foreign_key="leads.id", index=True)
    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )

    signal_type: SignalType = Field(default=SignalType.OTHER, index=True)
    source: SignalSource = Field(default=SignalSource.WEBHOOK, index=True)

    title: str = Field(nullable=False)
    description: str | None = Field(default=None)
    # Normalized external identifier (e.g. provider + external id) for idempotent
    # ingestion / dedup.
    external_id: str | None = Field(default=None, index=True)

    # Relevance/strength of the signal (0-100), assigned by analyzers.
    score: float = Field(default=0.0, index=True)
    # Model/analyzer confidence in the classification (0-1).
    confidence: float = Field(default=0.0)

    # When the underlying event actually happened (vs. when we ingested it).
    detected_at: datetime = Field(default_factory=utcnow, index=True)

    # The untouched original payload, preserved for reprocessing and auditing.
    raw_payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    # Structured output of the analyzer(s): extracted entities, tags, etc.
    analysis: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ----- Relationships -------------------------------------------------------
    company: "Company" = Relationship(back_populates="signals")
    lead: "Lead" = Relationship(back_populates="signals")
    opportunities: list["Opportunity"] = Relationship(back_populates="signal")
