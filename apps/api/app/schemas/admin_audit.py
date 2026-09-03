"""Schemas for GET /audit/admin — see app.models.admin_audit_log."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AdminAuditLogOut(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    summary: str
    detail: dict[str, Any]
    ip_address: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
