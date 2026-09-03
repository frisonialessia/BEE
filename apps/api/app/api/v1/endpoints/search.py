"""Cross-entity semantic search — "Ask BEE" — see app.services.brain_search.

Deliberately requires a real authenticated user (not
``get_current_user_optional``, unlike most list endpoints in this codebase):
an unscoped org_id would make ``scope_by_organization_id`` a no-op — see its
own docstring — which for a full-text search across signals, companies and
opportunities would mean leaking every tenant's data to whoever calls this
without a session. There is no legitimate "API-key, no user" caller for a
search box.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.database import get_session
from app.models.user import User
from app.schemas.brain_search import BrainSearchResultOut
from app.services.brain_search.service import BrainSearchService

router = APIRouter(prefix="/search", tags=["Intelligence"])


@router.get(
    "",
    response_model=list[BrainSearchResultOut],
    summary="Natural-language search across this org's signals, companies and opportunities",
)
def search_brain(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=25),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[BrainSearchResultOut]:
    svc = BrainSearchService(session)
    results = svc.search(current_user.organization_id, q, limit=limit)
    return [
        BrainSearchResultOut(
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            title=r.title,
            snippet=r.snippet,
            score=r.score,
        )
        for r in results
    ]
