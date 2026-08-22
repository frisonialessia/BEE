"""Company (Empresa) entity.

A Company is the top-level account BEE tracks. Leads, signals and opportunities
all ultimately relate back to a company, which is the unit of market
intelligence.
"""

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover - typing only, avoids circular imports
    from app.models.lead import Lead
    from app.models.opportunity import Opportunity
    from app.models.signal import Signal


class Company(TimestampMixin, table=True):
    """A tracked company / account."""

    __tablename__ = "companies"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )

    name: str = Field(index=True, nullable=False)
    # Canonical domain is the natural dedup key for enrichment integrations.
    domain: str | None = Field(default=None, index=True, unique=True)
    industry: str | None = Field(default=None, index=True)
    # Free-form headcount band (e.g. "11-50") to stay provider-agnostic.
    size: str | None = Field(default=None)
    country: str | None = Field(default=None, index=True)
    website: str | None = Field(default=None)
    description: str | None = Field(default=None)

    # Firmographic enrichment and provider-specific fields are kept in a JSON
    # column so the schema stays stable while integrations evolve.
    attributes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ----- Relationships -------------------------------------------------------
    leads: list["Lead"] = Relationship(back_populates="company")
    signals: list["Signal"] = Relationship(back_populates="company")
    opportunities: list["Opportunity"] = Relationship(back_populates="company")
