"""PendingAction repository."""

from __future__ import annotations

import uuid

from sqlmodel import select

from app.models.base import ActionStatus
from app.models.pending_action import PendingAction
from app.repositories.base import BaseRepository
from app.services.permissions import scope_by_organization_id


class PendingActionRepository(BaseRepository[PendingAction]):
    model = PendingAction

    def list_pending(
        self,
        limit: int = 50,
        offset: int = 0,
        organization_id: uuid.UUID | None = None,
    ) -> list[PendingAction]:
        """Return all actions awaiting approval, ordered by priority desc then created_at."""
        stmt = select(PendingAction).where(PendingAction.status == ActionStatus.PENDING_APPROVAL)
        stmt = scope_by_organization_id(stmt, PendingAction.organization_id, organization_id)
        stmt = stmt.order_by(
            PendingAction.priority.desc(), PendingAction.created_at.asc()  # type: ignore[attr-defined]
        ).limit(limit).offset(offset)
        return list(self.session.exec(stmt).all())

    def list_by_opportunity(
        self,
        opportunity_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
    ) -> list[PendingAction]:
        stmt = select(PendingAction).where(PendingAction.opportunity_id == opportunity_id)
        stmt = scope_by_organization_id(stmt, PendingAction.organization_id, organization_id)
        stmt = stmt.order_by(PendingAction.created_at.desc())
        return list(self.session.exec(stmt).all())

    def list_approved(
        self,
        limit: int = 50,
        organization_id: uuid.UUID | None = None,
    ) -> list[PendingAction]:
        """Return approved actions ready to be executed by external tools."""
        stmt = select(PendingAction).where(PendingAction.status == ActionStatus.APPROVED)
        stmt = scope_by_organization_id(stmt, PendingAction.organization_id, organization_id)
        stmt = stmt.order_by(
            PendingAction.priority.desc(), PendingAction.approved_at.asc()  # type: ignore[attr-defined]
        ).limit(limit)
        return list(self.session.exec(stmt).all())

    def count_by_status(self, organization_id: uuid.UUID | None = None) -> dict[str, int]:
        """Return action counts grouped by status for dashboard metrics."""
        stmt = scope_by_organization_id(select(PendingAction), PendingAction.organization_id, organization_id)
        results = self.session.exec(stmt).all()
        counts: dict[str, int] = {}
        for action in results:
            key = str(action.status.value if hasattr(action.status, "value") else action.status)
            counts[key] = counts.get(key, 0) + 1
        return counts
