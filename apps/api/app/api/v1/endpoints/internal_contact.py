"""Read side of the public contact/waitlist inbox — BEE team only.

``POST /api/v1/contact`` has persisted every public submission since it was
written, and until now **nothing could read them back**. Whoever filled the
/contacto form landed in a table that no endpoint, no page and no export
ever touched; the only way to see them was to open a SQL console against
production. That is not a small gap once the landing's primary call to
action is a waitlist: the entire point of the waitlist is the list.

Why this is its own router and not another action on
``internal_support.py``: that module is deliberately ONE narrow emergency
action and says so at length, because it reaches into a *customer's*
account. This one reads BEE's own inbound leads — rows with no
``organization_id`` at all, belonging to no tenant (see
``ContactSubmission``'s docstring). Different data, different blast radius,
so it gets its own module rather than widening that one.

It reuses ``SUPPORT_ADMIN_SECRET`` for the gate, with the same three
properties that made it the right choice there:

* Not ``API_SECRET_KEY`` and not ``JWT_SECRET_KEY`` — a leak of either must
  not also hand over the prospect list.
* Off by default: unset means this router 404s, so a deployment that never
  opted in has no additional surface.
* Compared timing-safe, never logged, never echoed back.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlmodel import Session, desc, select

from app.core.config import get_settings
from app.core.database import get_session
from app.models.contact_submission import ContactSubmission
from app.schemas.contact import ContactSubmissionListOut, ContactSubmissionRow

router = APIRouter(prefix="/internal/contact", tags=["Internal Contact Inbox (BEE team only)"])


def _require_support_secret(
    x_bee_support_secret: str | None = Header(default=None, alias="X-BEE-Support-Secret"),
) -> None:
    settings = get_settings()
    if not settings.SUPPORT_ADMIN_SECRET:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    if not x_bee_support_secret or not hmac.compare_digest(
        x_bee_support_secret, settings.SUPPORT_ADMIN_SECRET
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing support secret."
        )


@router.get(
    "/submissions",
    response_model=ContactSubmissionListOut,
    summary="[BEE team only] List public contact + waitlist submissions",
    dependencies=[Depends(_require_support_secret)],
)
def list_submissions(
    source: str | None = Query(
        default=None,
        description='Exact `source` to filter by, e.g. "waitlist_hero". Omit for every submission.',
    ),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> ContactSubmissionListOut:
    """Newest first. Capped like every other listing in this API.

    ``ip_address`` is deliberately not in the response: it is kept for spam
    triage only and this endpoint has no use for it (see the field's own
    comment on the model).
    """
    filters = []
    if source:
        filters.append(ContactSubmission.source == source)

    total = len(session.exec(select(ContactSubmission.id).where(*filters)).all())
    rows = session.exec(
        select(ContactSubmission)
        .where(*filters)
        .order_by(desc(ContactSubmission.created_at))
        .offset(offset)
        .limit(limit)
    ).all()

    return ContactSubmissionListOut(
        total=total,
        items=[ContactSubmissionRow.model_validate(r, from_attributes=True) for r in rows],
    )
