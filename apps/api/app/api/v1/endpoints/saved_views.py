"""Saved list-page views — a named, reusable filter/sort configuration.

See app.models.saved_view for the "why" (page-agnostic, opaque config
blob). Visibility: a view is visible to its creator always, and to the
whole organization when ``is_shared`` is set. Editing/deleting is limited
to the creator or an OWNER/ADMIN of the same organization — looser than
that would let any teammate silently rewrite someone else's saved filters.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, or_, select

from app.api.deps import get_current_user
from app.core.database import get_session
from app.models.base import UserRole
from app.models.saved_view import SavedView
from app.models.user import User
from app.schemas.saved_view import SavedViewCreateIn, SavedViewOut, SavedViewUpdateIn

router = APIRouter(prefix="/saved-views", tags=["Saved Views"])


def _can_edit(current_user: User, view: SavedView) -> bool:
    if view.organization_id is not None and view.organization_id != current_user.organization_id:
        return False
    if view.created_by_user_id == current_user.id:
        return True
    return current_user.role in (UserRole.OWNER, UserRole.ADMIN)


@router.post(
    "",
    response_model=SavedViewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Save a filter/sort configuration for a list page",
)
def create_saved_view(
    data: SavedViewCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SavedViewOut:
    view = SavedView(
        organization_id=current_user.organization_id,
        created_by_user_id=current_user.id,
        name=data.name,
        page=data.page,
        config=data.config,
        is_shared=data.is_shared,
    )
    session.add(view)
    session.commit()
    session.refresh(view)
    return SavedViewOut.model_validate(view)


@router.get(
    "",
    response_model=list[SavedViewOut],
    summary="List saved views for a page — the caller's own plus any shared ones",
)
def list_saved_views(
    page: str = Query(..., description="Which list page these views belong to, e.g. 'leads'"),
    session: Session = Depends(get_session),
    # Mandatory, not optional: saved views are a dashboard-only feature (no
    # API-key/webhook integration ever needs to read them), and unlike
    # organization_id=None (an intentional "untagged, shared" convention for
    # legacy pre-multi-tenant records elsewhere in this codebase), an
    # anonymous caller here has no organization to scope by at all — falling
    # back to "every org's shared views" would leak one tenant's saved
    # filters (segment names, criteria) to every other tenant.
    current_user: User = Depends(get_current_user),
) -> list[SavedViewOut]:
    statement = (
        select(SavedView)
        .where(SavedView.page == page)
        .where(
            or_(
                SavedView.created_by_user_id == current_user.id,
                (SavedView.is_shared == True) & (SavedView.organization_id == current_user.organization_id),  # noqa: E712
            )
        )
        .order_by(SavedView.created_at.desc())  # type: ignore[union-attr]
    )

    views = list(session.exec(statement).all())
    return [SavedViewOut.model_validate(v) for v in views]


@router.patch(
    "/{view_id}",
    response_model=SavedViewOut,
    summary="Update a saved view (creator or OWNER/ADMIN only)",
)
def update_saved_view(
    view_id: uuid.UUID,
    data: SavedViewUpdateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SavedViewOut:
    view = session.get(SavedView, view_id)
    if view is None or not _can_edit(current_user, view):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved view not found.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(view, field, value)

    session.add(view)
    session.commit()
    session.refresh(view)
    return SavedViewOut.model_validate(view)


@router.delete(
    "/{view_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved view (creator or OWNER/ADMIN only)",
)
def delete_saved_view(
    view_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    view = session.get(SavedView, view_id)
    if view is None or not _can_edit(current_user, view):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved view not found.")

    session.delete(view)
    session.commit()
