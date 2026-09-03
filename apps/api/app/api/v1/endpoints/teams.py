"""Team endpoints — the manager hierarchy, scoped to the caller's organization."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.team import Team
from app.models.user import User
from app.schemas.auth import TeamCreate, TeamOut, TeamUpdate
from app.schemas.team_profile import TeamProfileIn, TeamProfileOut
from app.services.team_profile import TeamProfileService

router = APIRouter(prefix="/teams", tags=["Teams"])


def _get_org_team_or_404(session: Session, team_id: uuid.UUID, organization_id: uuid.UUID) -> Team:
    team = session.get(Team, team_id)
    if team is None or team.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")
    return team


@router.post(
    "",
    response_model=TeamOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a team (OWNER/ADMIN only)",
)
def create_team(
    data: TeamCreate,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> Team:
    if data.parent_team_id is not None:
        _get_org_team_or_404(session, data.parent_team_id, current_user.organization_id)

    team = Team(
        organization_id=current_user.organization_id,
        name=data.name,
        description=data.description,
        parent_team_id=data.parent_team_id,
    )
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


@router.put(
    "/{team_id}/profile",
    response_model=TeamProfileOut,
    summary="Set a team's signal weights and research focus (OWNER/ADMIN only)",
)
def set_team_profile(
    team_id: uuid.UUID,
    data: TeamProfileIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> TeamProfileOut:
    """Replaces the team's profile wholesale — same "replace, don't patch"
    convention as the CEO voice profile. Biases /priority/today's ranking
    for this team's opportunities and, when research_focus is set, steers
    AccountResearchAgent's synthesis for whoever's on this team.
    """
    svc = TeamProfileService(session)
    profile = svc.create_or_update(team_id, current_user.organization_id, data)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")
    session.commit()
    session.refresh(profile)
    return TeamProfileOut.model_validate(profile)


@router.get(
    "/{team_id}/profile",
    response_model=TeamProfileOut | None,
    summary="Get a team's signal weights and research focus (null when none is set yet)",
)
def get_team_profile(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TeamProfileOut | None:
    """``null`` (200) rather than 404 for a team that hasn't set a profile:
    that is every team's initial state, and the Strategies page asks for it
    on load — a 404 there showed up as a red "Failed to load resource" in
    the browser console on every visit, indistinguishable from a real error.
    A team from another organization is still invisible (also ``null``),
    same as before."""
    svc = TeamProfileService(session)
    profile = svc.get(team_id, current_user.organization_id)
    if profile is None:
        return None
    return TeamProfileOut.model_validate(profile)


@router.get("", response_model=list[TeamOut], summary="List teams in the caller's organization")
def list_teams(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Team]:
    statement = select(Team).where(Team.organization_id == current_user.organization_id)
    return list(session.exec(statement).all())


@router.patch(
    "/{team_id}",
    response_model=TeamOut,
    summary="Update a team's name, description, or parent (OWNER/ADMIN only)",
)
def update_team(
    team_id: uuid.UUID,
    data: TeamUpdate,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> Team:
    team = _get_org_team_or_404(session, team_id, current_user.organization_id)

    if data.parent_team_id is not None:
        if data.parent_team_id == team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A team cannot be its own parent.")
        _get_org_team_or_404(session, data.parent_team_id, current_user.organization_id)
        team.parent_team_id = data.parent_team_id
    if data.name is not None:
        team.name = data.name
    if data.description is not None:
        team.description = data.description

    session.add(team)
    session.commit()
    session.refresh(team)
    return team
