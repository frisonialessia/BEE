"""WorkflowTask — audit trail for the WorkflowOrchestrator event bus.

Every time a BeeEvent is published (e.g., ``opportunity.won``), the
WorkflowOrchestrator runs all registered handlers. Each handler creates a
``WorkflowTask`` record so the system has a complete, auditable log of every
automated action triggered by a business event.

Opt-in design
-------------
If no external systems are configured (URLs are None), the task is created with
``status = MOCK_DISPATCHED`` and ``mock = True``. This lets the entire workflow
system be exercised in development and tests without any real integrations.

The CEO can activate live integrations one by one by setting the corresponding
environment variable. BEE never auto-enables anything that touches external systems.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class WorkflowTaskStatus(str):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    MOCK_DISPATCHED = "mock_dispatched"  # sent to mock, no real external call
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"  # handler disabled or conditions not met


class WorkflowTask(TimestampMixin, table=True):
    """One automated task triggered by a BEE domain event."""

    __tablename__ = "workflow_tasks"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # ── Event origin ──────────────────────────────────────────────────────────
    event_type: str = Field(index=True, nullable=False)
    # The entity that triggered the event (e.g., opportunity_id for opportunity.won)
    entity_id: uuid.UUID | None = Field(default=None, index=True)
    entity_type: str | None = Field(default=None)  # "opportunity", "lead", etc.

    # ── Handler that produced this task ───────────────────────────────────────
    handler_name: str = Field(index=True, nullable=False)
    handler_version: str = Field(default="1.0.0")

    # ── Execution state ───────────────────────────────────────────────────────
    status: str = Field(default=WorkflowTaskStatus.PENDING, index=True)
    mock: bool = Field(default=False)  # True = no real external call was made

    # ── Payload sent to the external system ───────────────────────────────────
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ── Response from the external system (or mock) ───────────────────────────
    result: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))

    # ── Timing ─────────────────────────────────────────────────────────────────
    dispatched_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)

    # ── Error tracking ────────────────────────────────────────────────────────
    error_message: str | None = Field(default=None)
    retry_count: int = Field(default=0)

    @property
    def is_terminal(self) -> bool:
        return self.status in (
            WorkflowTaskStatus.COMPLETED,
            WorkflowTaskStatus.FAILED,
            WorkflowTaskStatus.MOCK_DISPATCHED,
            WorkflowTaskStatus.SKIPPED,
        )
