"""NetworkNavigator models — warm intro path mapping.

The CEO's professional network is a strategic sales asset. A warm introduction
through a mutual connection dramatically outperforms cold outreach in both
response rate and deal velocity.

NetworkNavigator maps 'introduction paths' from the CEO to any target contact
at a prospect company, surfacing the shortest, strongest paths for relationship-
based selling.

Connection tiers
----------------
* 1st-degree (direct): CEO ↔ Contact. No introduction needed.
* 2nd-degree (warm):   CEO → Connector → Target. One warm intro needed.
* 3rd-degree (extended): CEO → A → B → Target. Possible but weaker.

Relationship strength
---------------------
A 1-10 score representing how strong the CEO's relationship with a connection
is:
* 10: Close friend / co-founder / long-term business partner
* 7-9: Strong professional relationship, met regularly
* 4-6: Acquaintance, met at conferences, sporadic contact
* 1-3: LinkedIn connection only, no real interaction

Integration with EnrichmentContext
-----------------------------------
``NetworkNavigator.find_intro_paths(target_company)`` returns ``list[IntroPath]``
which is injected into ``EnrichmentContext.intro_paths``. The ExecutiveAgent
uses this to replace cold email subjects with:
  "You're connected to [Target] through [Connector] — here's an intro request draft."
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class ConnectionType(str):
    FIRST_DEGREE = "first_degree"   # Direct connection (LinkedIn 1st, etc.)
    SECOND_DEGREE = "second_degree"  # Friend of a connection
    REFERRAL = "referral"            # Actively referred by someone
    ALUMNI = "alumni"                # Shared university/company background
    COMMUNITY = "community"          # Same professional community/group


class NetworkConnection(TimestampMixin, table=True):
    """A node in the CEO's professional network.

    Each record represents a connection the CEO has with a specific person.
    Connections can be added manually, imported from LinkedIn exports, or
    detected from email/calendar patterns.
    """

    __tablename__ = "network_connections"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # ── Contact identity ──────────────────────────────────────────────────────
    contact_name: str = Field(nullable=False, index=True)
    contact_company: str = Field(nullable=False, index=True)
    contact_domain: str = Field(nullable=False, index=True, description="Email domain of the contact's company")
    contact_title: str | None = Field(default=None)
    contact_email: str | None = Field(default=None)
    contact_linkedin_url: str | None = Field(default=None)

    # ── Relationship ──────────────────────────────────────────────────────────
    connection_type: str = Field(default=ConnectionType.FIRST_DEGREE, index=True)
    relationship_strength: int = Field(
        default=5,
        ge=1,
        le=10,
        description="1-10 strength of the CEO's relationship with this contact.",
    )
    notes: str | None = Field(default=None, description="Context about how they know each other.")

    # ── Mutual connections ────────────────────────────────────────────────────
    # List of connection IDs or names that are mutual connections.
    # Used for 2nd-degree path finding.
    mutual_connection_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    # ── Tags ──────────────────────────────────────────────────────────────────
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    industries: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    # ── Activity ──────────────────────────────────────────────────────────────
    last_interaction_at: str | None = Field(default=None, description="ISO date of last meaningful interaction.")
    interaction_count: int = Field(default=0)

    active: bool = Field(default=True, index=True)

    # ── Source ────────────────────────────────────────────────────────────────
    source: str = Field(default="manual", description="manual | linkedin_export | email_mining | api")
    raw_data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
