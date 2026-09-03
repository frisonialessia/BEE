"""AdminAuditService — records and queries AdminAuditLog rows.

See app.models.admin_audit_log's module docstring for what this is and
isn't (not AuditTrailService's AI-decision log). ``log()`` is
non-blocking by convention — every call site wraps it so a logging
failure never blocks the primary action it's recording, same
"observability must never break the primary action" rule
StrategyGeneratorService.enrich's own call sites already follow for
AuditTrailService.

Actions actually logged today (call sites, not enforced by this module —
``action`` is a free string, add a new one at its call site with no
migration needed here):

* ``user.role_changed`` / ``user.deleted`` / ``user.deactivated`` — app.api.v1.endpoints.users
* ``api_key.created`` / ``api_key.revoked`` — app.api.v1.endpoints.api_keys
* ``integration.connected`` / ``integration.disconnected`` — app.api.v1.endpoints.integrations
* ``icp_criteria.updated`` — app.api.v1.endpoints.organizations
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.admin_audit_log import AdminAuditLog
from app.services.permissions import scope_by_organization_id as _scope

logger = get_logger(__name__)


class AdminAuditService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def log(
        self,
        *,
        organization_id: uuid.UUID,
        actor_user_id: uuid.UUID | None,
        action: str,
        summary: str,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        detail: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AdminAuditLog | None:
        """Record one admin action. Returns ``None`` (never raises) on
        failure — same non-blocking contract as AuditTrailService.record_decision,
        so a logging failure can never take down the action it's describing."""
        try:
            entry = AdminAuditLog(
                organization_id=organization_id,
                actor_user_id=actor_user_id,
                action=action,
                summary=summary,
                entity_type=entity_type,
                entity_id=entity_id,
                detail=detail or {},
                ip_address=ip_address,
            )
            self.session.add(entry)
            self.session.flush()
            return entry
        except Exception:  # noqa: BLE001
            logger.exception("AdminAuditService.log failed for action=%s org=%s", action, organization_id)
            return None

    def list_entries(
        self,
        *,
        organization_id: uuid.UUID | None,
        action: str | None = None,
        entity_id: uuid.UUID | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AdminAuditLog]:
        stmt = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())  # type: ignore[union-attr]
        if action:
            stmt = stmt.where(AdminAuditLog.action == action)
        if entity_id:
            stmt = stmt.where(AdminAuditLog.entity_id == entity_id)
        stmt = _scope(stmt, AdminAuditLog.organization_id, organization_id)
        stmt = stmt.limit(limit).offset(offset)
        return list(self.session.exec(stmt).all())
