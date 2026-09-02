"""TeamProfile — per-team signal focus and research emphasis.

``Team`` (app.models.team) is purely a manager-visibility hierarchy today —
who can see whose opportunities. TeamProfile is the signal-intelligence
counterpart: a team's own bias on which signal types matter most to them,
plus a free-text research focus that steers AccountResearchAgent's synthesis
toward what that team actually sells.

One profile per team (``team_id`` unique) — same "replace, don't patch"
convention as VoiceProfile: PUT replaces it wholesale rather than a partial
PATCH, since a rep edits both fields together in one settings form.

Deliberately does NOT duplicate Organization.icp_criteria's firmographic
matching here. icp_criteria stays org-wide by design (one shared definition
of "who we sell to"); TeamProfile only changes *ranking bias* for opportunities
a team can already see and *what AccountResearchAgent emphasizes* — it never
changes which accounts exist or who owns them.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin, new_uuid

if TYPE_CHECKING:  # pragma: no cover
    from app.models.team import Team


class TeamProfile(TimestampMixin, table=True):
    """A team's signal-weighting and research-focus configuration."""

    __tablename__ = "team_profiles"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    team_id: uuid.UUID = Field(foreign_key="teams.id", unique=True, index=True, nullable=False)
    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True, nullable=False)

    # SignalType value -> multiplier applied to that signal's opportunities in
    # /api/v1/priority/today's ranking for this team. Unlisted types keep the
    # neutral 1.0 multiplier — same "absence = no opinion" convention as
    # Organization.icp_criteria's empty lists.
    signal_weights: dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON))

    # Free-text steer for AccountResearchAgent's synthesis prompt — e.g. "Focus
    # on regulatory readiness for LATAM fintech accounts." Optional; None means
    # research stays generic (today's behavior, unchanged).
    research_focus: str | None = Field(default=None, max_length=2000)

    # ----- Relationships -------------------------------------------------------
    team: Team = Relationship()
