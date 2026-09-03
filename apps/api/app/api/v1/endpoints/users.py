"""User (teammate) management endpoints, scoped to the caller's organization.

There is no self-serve signup here — only ``POST /api/v1/auth/register``
creates an Organization (with its OWNER). Every other teammate is added by an
existing OWNER/ADMIN via ``POST /api/v1/users``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.core.security import hash_password
from app.models.base import UserRole
from app.models.team import Team
from app.models.user import User
from app.schemas.auth import UserCreate, UserOut, UserProfileUpdateIn, UserUpdate
from app.services.admin_audit import AdminAuditService
from app.services.permissions import get_visible_user_ids

router = APIRouter(prefix="/users", tags=["Users"])


@router.post(
    "",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a teammate to the caller's organization (OWNER/ADMIN only)",
)
def create_user(
    data: UserCreate,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> User:
    email = data.email.strip().lower()
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Email '{email}' is already registered.")

    if data.team_id is not None:
        team = session.get(Team, data.team_id)
        if team is None or team.organization_id != current_user.organization_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")

    user = User(
        organization_id=current_user.organization_id,
        team_id=data.team_id,
        email=email,
        full_name=data.full_name.strip(),
        role=data.role,
        hashed_password=hash_password(data.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.get(
    "",
    response_model=list[UserOut],
    summary="List teammates visible to the caller (org-wide for OWNER/ADMIN, own subtree for MANAGER, self for MEMBER)",
)
def list_users(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[User]:
    visible_ids = get_visible_user_ids(session, current_user)
    statement = select(User).where(User.organization_id == current_user.organization_id)
    if visible_ids is not None:
        statement = statement.where(User.id.in_(visible_ids))
    return list(session.exec(statement).all())


@router.patch(
    "/me",
    response_model=UserOut,
    summary="Edit your own profile (name, avatar, phone, bio)",
)
def update_my_profile(
    data: UserProfileUpdateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    """Registered before ``/{user_id}`` on purpose — a static path segment
    must come before a dynamic one, or Starlette matches "me" as a user_id
    and fails UUID validation before this handler ever runs (same note as
    ``GET /companies/duplicates``).

    Deliberately cannot touch role/team_id/is_active — see
    ``UserProfileUpdateIn``'s docstring for why that's a separate schema
    from the OWNER/ADMIN-only ``PATCH /{user_id}`` below.
    """
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete your own account",
)
def delete_my_account(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Self-service account deletion — deactivates, same as ``DELETE
    /{user_id}`` and for the same reason (the FK/audit-trail integrity
    ``delete_user``'s docstring explains; nothing here changes that).

    The organization OWNER cannot self-delete: ownership transfer isn't
    implemented yet (see ``update_user``'s docstring), so letting the OWNER
    delete themselves would strand the organization with no one able to
    manage billing or add/remove teammates. An OWNER who wants to leave
    needs to promote another member first — not yet possible via the API,
    so today this means contacting support.
    """
    if current_user.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "The organization OWNER cannot delete their own account — "
                "ownership transfer isn't supported yet. Contact support."
            ),
        )

    current_user.is_active = False
    session.add(current_user)
    AdminAuditService(session).log(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        action="user.self_deleted",
        summary=f"{current_user.email} deleted their own account.",
        entity_type="user",
        entity_id=current_user.id,
    )
    session.commit()


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    summary="Change a teammate's role, team, or active status (OWNER/ADMIN only)",
)
def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> User:
    target = session.get(User, user_id)
    if target is None or target.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if target.role == UserRole.OWNER and data.role is not None and data.role != UserRole.OWNER:
        # Prevents locking an organization out of its own OWNER account by
        # accident (or a rogue ADMIN demoting the owner). Ownership transfer
        # is intentionally not exposed yet.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The organization OWNER's role cannot be changed.")

    changes: dict[str, dict[str, str | bool | None]] = {}
    if data.team_id is not None:
        team = session.get(Team, data.team_id)
        if team is None or team.organization_id != current_user.organization_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")
        changes["team_id"] = {"from": str(target.team_id), "to": str(data.team_id)}
        target.team_id = data.team_id
    if data.role is not None and data.role != target.role:
        changes["role"] = {"from": target.role.value, "to": data.role.value}
        target.role = data.role
    if data.is_active is not None and data.is_active != target.is_active:
        changes["is_active"] = {"from": target.is_active, "to": data.is_active}
        target.is_active = data.is_active

    session.add(target)
    if changes:
        # entity_id/actor distinct people — target being changed, current_user
        # doing the changing. "role" is singled out in the action name (not
        # just a generic "user.updated") since it's the change a security
        # review is most likely to ask about specifically.
        action = "user.role_changed" if "role" in changes else "user.updated"
        AdminAuditService(session).log(
            organization_id=current_user.organization_id,
            actor_user_id=current_user.id,
            action=action,
            summary=f"{current_user.email} updated {target.email} ({', '.join(changes)}).",
            entity_type="user",
            entity_id=target.id,
            detail=changes,
        )
    session.commit()
    session.refresh(target)
    return target


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a teammate from the caller's organization (OWNER/ADMIN only)",
)
def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> None:
    """Deactivates the teammate rather than deleting the row.

    A hard delete isn't safe here: ``User`` is referenced by
    ``assigned_to_user_id``/``created_by_user_id`` FKs across leads,
    opportunities, templates, and more (none set ``ondelete=CASCADE``), plus
    the audit trail and every past approval/outcome this person is on record
    for — deleting the row would either fail outright on the FK constraints
    or silently erase that history. Deactivation gives the same practical
    result the caller wants (this person can no longer log in or act — see
    ``app.api.deps._load_user_from_token``'s ``is_active`` re-check on every
    request) while keeping everything they're on record for intact. Same
    ``is_active=False`` a PATCH already sets — this is just the dedicated,
    discoverable "remove" action for it.
    """
    target = session.get(User, user_id)
    if target is None or target.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if target.role == UserRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The organization OWNER cannot be removed.")

    if target.id == current_user.id:
        # An ADMIN removing themselves is still a real scenario (an OWNER
        # can't be removed at all, per the check above) — block it anyway so
        # nobody locks themselves out mid-session; another OWNER/ADMIN can
        # remove them instead.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot remove your own account.")

    target.is_active = False
    session.add(target)
    AdminAuditService(session).log(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        action="user.deactivated",
        summary=f"{current_user.email} removed {target.email} from the organization.",
        entity_type="user",
        entity_id=target.id,
    )
    session.commit()
