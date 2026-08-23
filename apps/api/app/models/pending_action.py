"""PendingAction — the security gate of BEE's autonomous execution layer.

Every action that touches an external system (send email, update CRM, post on
LinkedIn) MUST be represented as a ``PendingAction`` before any execution.
There is no shortcut: the state machine enforces human approval for every
outbound interaction.

Security rationale
------------------
Autonomous systems that send emails or update CRMs without explicit human
sign-off create compliance and trust problems. BEE's design mirrors the way
financial trading systems work: the intelligence layer *recommends*, but a
human (or an explicitly-authorized automation) *executes*.

The ``PENDING_APPROVAL`` state is the security gate. n8n/Zapier polls
``GET /orchestrator/pending-actions``, but cannot execute anything until a
human POSTs to ``/orchestrator/{id}/approve``.

State machine::

    PENDING_APPROVAL
        → APPROVED  (via explicit approval endpoint)
        → REJECTED  (via explicit rejection endpoint)
    APPROVED
        → EXECUTING (external tool starts working on it)
    EXECUTING
        → COMPLETED (via /complete endpoint, called by the external tool)
        → FAILED    (via /fail endpoint; retryable → PENDING_APPROVAL)
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import ActionStatus, ActionType, TimestampMixin, new_uuid


class PendingAction(TimestampMixin, table=True):
    """One executable action waiting for human approval."""

    __tablename__ = "pending_actions"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )

    # ── Origin ──────────────────────────────────────────────────────────────
    opportunity_id: uuid.UUID | None = Field(default=None, index=True, nullable=True)
    artifact_bundle_id: str | None = Field(default=None)  # reference to ArtifactBundle

    # ── Classification ────────────────────────────────────────────────────────
    action_type: ActionType = Field(index=True, nullable=False)
    status: ActionStatus = Field(default=ActionStatus.PENDING_APPROVAL, index=True)

    # ── Payload (the actual artifact content to execute) ─────────────────────
    # Snapshot of the relevant artifact at approval time. Stored so the action
    # is self-contained — even if the opportunity is updated later.
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ── Context for the approver ─────────────────────────────────────────────
    title: str = Field(nullable=False)
    description: str | None = Field(default=None)
    # Human-readable summary of what the action will do (for the approval UI).
    preview: str | None = Field(default=None)

    # ── Approval tracking ────────────────────────────────────────────────────
    approved_by: str | None = Field(default=None)  # user ID / email of approver
    approved_at: datetime | None = Field(default=None)
    rejected_reason: str | None = Field(default=None)

    # ── Execution tracking ────────────────────────────────────────────────────
    executing_tool: str | None = Field(default=None)  # "n8n", "zapier", "manual"
    execution_started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    failure_reason: str | None = Field(default=None)
    retry_count: int = Field(default=0)

    # ── Metadata ─────────────────────────────────────────────────────────────
    priority: int = Field(default=50, index=True)  # 0-100, higher = more urgent
    expires_at: datetime | None = Field(default=None)  # auto-reject if not approved

    @property
    def is_terminal(self) -> bool:
        return self.status in (ActionStatus.COMPLETED, ActionStatus.REJECTED)

    @property
    def is_retryable(self) -> bool:
        return self.status == ActionStatus.FAILED and self.retry_count < 3

    @property
    def can_approve(self) -> bool:
        return self.status == ActionStatus.PENDING_APPROVAL

    def mark_approved(self, approver: str) -> None:
        self.status = ActionStatus.APPROVED
        self.approved_by = approver
        self.approved_at = datetime.now(UTC)

    def mark_rejected(self, reason: str | None = None) -> None:
        self.status = ActionStatus.REJECTED
        self.rejected_reason = reason
        self.approved_at = datetime.now(UTC)

    def mark_executing(self, tool: str) -> None:
        self.status = ActionStatus.EXECUTING
        self.executing_tool = tool
        self.execution_started_at = datetime.now(UTC)

    def mark_completed(self) -> None:
        self.status = ActionStatus.COMPLETED
        self.completed_at = datetime.now(UTC)

    def mark_failed(self, reason: str | None = None) -> None:
        self.status = ActionStatus.FAILED
        self.failure_reason = reason
        self.retry_count += 1
