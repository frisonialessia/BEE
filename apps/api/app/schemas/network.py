"""Schemas for the NetworkNavigator API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NetworkConnectionCreate(BaseModel):
    contact_name: str = Field(min_length=2)
    contact_company: str = Field(min_length=2)
    contact_domain: str = Field(description="Email domain: techcorp.com")
    contact_title: str | None = None
    contact_email: str | None = None
    contact_linkedin_url: str | None = None
    connection_type: str = Field(default="first_degree")
    relationship_strength: int = Field(default=5, ge=1, le=10)
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    source: str = Field(default="manual")


class NetworkConnectionOut(BaseModel):
    id: uuid.UUID
    contact_name: str
    contact_company: str
    contact_domain: str
    contact_title: str | None
    connection_type: str
    relationship_strength: int
    notes: str | None
    tags: list[str]
    industries: list[str]
    interaction_count: int
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IntroStep(BaseModel):
    """One step in an introduction path."""

    person: str = Field(description="CEO or connector name")
    company: str
    relationship_to_next: str = Field(description="How this person knows the next in the chain")
    strength: int = Field(ge=1, le=10)


class IntroPath(BaseModel):
    """A complete warm introduction path from CEO to target."""

    target_name: str | None = None
    target_company: str
    target_domain: str
    path_length: int = Field(description="1 = direct, 2 = one connector, 3 = two connectors")
    intro_type: str = Field(description="warm_intro | referral | alumni | cold")
    strength_score: float = Field(ge=0.0, le=10.0, description="Composite relationship strength")
    connector_name: str | None = Field(default=None, description="The key connector in the path")
    connector_id: str | None = None
    steps: list[IntroStep]
    action_recommendation: str = Field(description="What the CEO should do next")
    draft_ask: str | None = Field(default=None, description="Draft intro request message to the connector")


class NetworkQueryResult(BaseModel):
    """Result of a network path query for a target company."""

    target_company: str
    target_domain: str
    paths_found: list[IntroPath]
    best_path: IntroPath | None
    cold_outreach_fallback: bool = Field(description="True if no warm paths exist and cold is the only option")
    network_coverage: str = Field(description="none | weak | moderate | strong")


class NetworkStats(BaseModel):
    total_connections: int
    first_degree_count: int
    second_degree_count: int
    top_industries: list[str]
    avg_relationship_strength: float
    companies_covered: int
