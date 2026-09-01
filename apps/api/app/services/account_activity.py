"""Recording and reading the real (human) account activity feed.

See app.models.account_activity's docstring for why this exists separately
from AuditEntry. This module is deliberately tiny — record on the two
moments that matter (a company's detail view opening, an edit landing) and
read back the most recent entries for the account detail panel.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.account_activity import AccountActivityEvent, AccountActivityEventType
from app.models.user import User

logger = get_logger(__name__)


def record_event(
    session: Session,
    *,
    organization_id: uuid.UUID | None,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    event_type: AccountActivityEventType,
) -> None:
    """Log one activity event. Best-effort, same posture as
    ``leads.py``'s ``_validate_new_lead``: this is an observability
    side-effect, and a failure here must never fail the request that
    triggered it (viewing or editing a company must always succeed even if
    the activity log write itself has a problem).

    Silently skipped when ``organization_id`` is ``None`` — an
    unauthenticated/API-key-only caller has no organization to scope the
    event to, and the endpoints that call this only do so for a logged-in
    ``current_user`` in the first place (see ``companies.py``), so this is
    a defensive no-op, not the expected path.
    """
    if organization_id is None:
        return
    try:
        session.add(
            AccountActivityEvent(
                organization_id=organization_id,
                company_id=company_id,
                user_id=user_id,
                event_type=event_type,
            )
        )
        session.commit()
    except Exception:  # noqa: BLE001
        session.rollback()
        logger.exception(
            "Failed to record account activity event for company %s", company_id
        )


def list_events_for_company(
    session: Session, company_id: uuid.UUID, *, limit: int = 20
) -> list[tuple[AccountActivityEvent, User]]:
    """Most recent activity first, each event paired with its actor.

    A plain join rather than two round trips — the feed always needs the
    user's current name/avatar to render, never just the event alone.
    """
    statement = (
        select(AccountActivityEvent, User)
        .join(User, User.id == AccountActivityEvent.user_id)  # type: ignore[arg-type]
        .where(AccountActivityEvent.company_id == company_id)
        .order_by(AccountActivityEvent.created_at.desc())  # type: ignore[union-attr]
        .limit(limit)
    )
    return list(session.exec(statement).all())
