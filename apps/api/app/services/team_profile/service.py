"""TeamProfileService — per-team signal weighting and research focus.

Consumed by two other services, not just its own CRUD endpoints:
* PriorityFeedService biases /api/v1/priority/today's ranking by the
  calling user's team's signal_weights.
* AccountResearchAgent's synthesis prompt is steered by the calling user's
  team's research_focus, when one is set.

Both consumers call get_signal_weight()/get_research_focus() rather than
loading a TeamProfile directly — cheap, tolerant-of-absence lookups that
never raise, so a team with no profile configured behaves exactly like
before this feature existed (neutral weight, generic research).
"""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.team import Team
from app.models.team_profile import TeamProfile
from app.schemas.team_profile import TeamProfileIn

logger = get_logger(__name__)

_DEFAULT_WEIGHT = 1.0


class TeamProfileService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_or_update(
        self, team_id: uuid.UUID, organization_id: uuid.UUID, data: TeamProfileIn
    ) -> TeamProfile | None:
        """Create or replace the team's profile. Returns None when team_id
        doesn't exist or belongs to another organization, so the endpoint
        can 404 without confirming a cross-tenant team id exists."""
        team = self.session.get(Team, team_id)
        if team is None or team.organization_id != organization_id:
            return None

        existing = self.session.exec(
            select(TeamProfile).where(TeamProfile.team_id == team_id)
        ).first()

        if existing is not None:
            existing.signal_weights = data.signal_weights
            existing.research_focus = data.research_focus
            profile = existing
        else:
            profile = TeamProfile(
                team_id=team_id,
                organization_id=organization_id,
                signal_weights=data.signal_weights,
                research_focus=data.research_focus,
            )

        self.session.add(profile)
        self.session.flush()
        self.session.refresh(profile)
        logger.info("TeamProfile saved: team_id=%s weights=%d", team_id, len(profile.signal_weights))
        return profile

    def get(self, team_id: uuid.UUID, organization_id: uuid.UUID) -> TeamProfile | None:
        team = self.session.get(Team, team_id)
        if team is None or team.organization_id != organization_id:
            return None
        return self.session.exec(
            select(TeamProfile).where(TeamProfile.team_id == team_id)
        ).first()

    # ── Lightweight lookups for other services ──────────────────────────────

    def get_signal_weight(self, team_id: uuid.UUID | None, signal_type: str) -> float:
        """The ranking multiplier this team applies to `signal_type`.

        Returns the neutral 1.0 for a team with no profile, a profile that
        doesn't mention this signal_type, or no team at all (team_id=None —
        an org-wide/manager-less view has no team bias to apply).
        """
        if team_id is None:
            return _DEFAULT_WEIGHT
        try:
            profile = self.session.exec(
                select(TeamProfile).where(TeamProfile.team_id == team_id)
            ).first()
        except Exception:  # noqa: BLE001 — never let a lookup failure break ranking
            logger.debug("TeamProfile lookup failed for team_id=%s", team_id, exc_info=True)
            return _DEFAULT_WEIGHT
        if profile is None:
            return _DEFAULT_WEIGHT
        return profile.signal_weights.get(signal_type, _DEFAULT_WEIGHT)

    def get_research_focus(self, team_id: uuid.UUID | None) -> str | None:
        """This team's research-focus steer, or None when there's no team,
        no profile, or the profile doesn't set one — AccountResearchAgent
        falls back to its generic prompt in every one of those cases."""
        if team_id is None:
            return None
        try:
            profile = self.session.exec(
                select(TeamProfile).where(TeamProfile.team_id == team_id)
            ).first()
        except Exception:  # noqa: BLE001 — never let a lookup failure break research
            logger.debug("TeamProfile lookup failed for team_id=%s", team_id, exc_info=True)
            return None
        return profile.research_focus if profile else None
