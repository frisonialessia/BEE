"""Dead Letter Queue (DLQ) models for the WorkflowOrchestrator.

The DLQ captures any webhook event or external action that fails to execute.
Instead of silently discarding failures, BEE records them with full context
and applies exponential backoff retry logic until either:

  a) The event succeeds (status=resolved), or
  b) The maximum retry count is reached (status=permanently_failed) and the
     CEO receives an alert via the AgentOrchestrator PendingAction system.

Retry schedule (exponential backoff, base=4s, max 5 attempts)
--------------------------------------------------------------
  Attempt 1: wait   4s   (base × 2^0)
  Attempt 2: wait   8s   (base × 2^1)
  Attempt 3: wait  16s   (base × 2^2)
  Attempt 4: wait  32s   (base × 2^3)
  Attempt 5: wait  64s   (base × 2^4)
  Attempt 6+: permanently_failed → CEO alert

In production this is driven by a Celery/ARQ background task reading
``FailedEvent`` records where ``next_retry_at <= now`` and ``status=pending``.
In the current architecture (no Celery), the retry is triggered on-demand
via ``POST /api/v1/workflow/dlq/{id}/retry`` or the batch retry endpoint.

Design rationale
----------------
Keeping DLQ events in Postgres (same DB as everything else) avoids a
separate Redis/RabbitMQ dependency for MVP. The trade-off is that the
retry worker must poll the table — acceptable at BEE's current scale.

The ``original_event`` JSON stores the full ``BeeEvent`` payload so a
retry can reconstruct the exact original call without relying on any
ephemeral state.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class DLQStatus(str):
    PENDING = "pending"                 # Waiting for next retry
    RETRYING = "retrying"               # Currently being retried
    RESOLVED = "resolved"               # Successfully retried
    PERMANENTLY_FAILED = "permanently_failed"  # Max retries exhausted — CEO alerted


class DLQEventType(str):
    WEBHOOK = "webhook"                 # External webhook call failure
    EMAIL_SEND = "email_send"           # SMTP delivery failure
    LINKEDIN_MESSAGE = "linkedin_message"  # LinkedIn API failure
    TWITTER_DM = "twitter_dm"          # Twitter API failure
    SEQUENCE_STEP = "sequence_step"    # DynamicSequence step execution failure
    WORKFLOW_HANDLER = "workflow_handler"  # WorkflowOrchestrator handler failure
    OTHER = "other"


_BASE_DELAY_SECONDS = 4       # Exponential base: 4s, 8s, 16s, 32s, 64s
_MAX_ATTEMPTS = 5             # After this many failures → permanently_failed


def compute_next_retry_delay(attempt: int) -> int:
    """Return the delay in seconds before the next retry attempt.

    Args:
        attempt: The number of attempts already made (0-indexed).
                 attempt=0 → first retry in 4s
                 attempt=4 → fifth retry in 64s

    Returns:
        Seconds to wait before retrying.
    """
    return _BASE_DELAY_SECONDS * (2 ** min(attempt, 8))  # cap at 1024s to be safe


class FailedEvent(TimestampMixin, table=True):
    """A failed event waiting for retry in the Dead Letter Queue.

    Records the full original event payload, all error history, and the
    computed retry schedule. The retry worker processes records where
    ``next_retry_at <= now()`` and ``status in (pending, retrying)``.
    """

    __tablename__ = "failed_events"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # ── Event identity ─────────────────────────────────────────────────────────
    event_type: str = Field(index=True, default=DLQEventType.WEBHOOK)
    event_name: str = Field(index=True, description="e.g. 'opportunity.won', 'send_email'")

    # ── Traceability ───────────────────────────────────────────────────────────
    opportunity_id: uuid.UUID | None = Field(default=None, index=True)
    lead_id: uuid.UUID | None = Field(default=None, index=True)
    pending_action_id: uuid.UUID | None = Field(default=None, index=True)
    workflow_task_id: uuid.UUID | None = Field(default=None, index=True)

    # ── Original event payload (full BeeEvent JSON for replay) ─────────────────
    original_event: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # ── Error history ─────────────────────────────────────────────────────────
    attempt_count: int = Field(default=0, description="Number of delivery attempts made so far")
    last_error: str | None = Field(default=None, description="Error message from the most recent attempt")
    error_history: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="List of {attempt, error, timestamp} dicts from all past attempts",
    )

    # ── Retry schedule ────────────────────────────────────────────────────────
    status: str = Field(default=DLQStatus.PENDING, index=True)
    next_retry_at: datetime | None = Field(
        default=None,
        index=True,
        description="When to attempt the next retry. Null = not yet scheduled.",
    )
    last_attempted_at: datetime | None = Field(default=None)

    # ── Resolution ────────────────────────────────────────────────────────────
    resolved_at: datetime | None = Field(default=None)
    resolution_notes: str | None = Field(default=None)

    # ── CEO alert ─────────────────────────────────────────────────────────────
    ceo_alerted: bool = Field(default=False, description="True if a PendingAction alert was sent to the CEO")

    @property
    def max_attempts_reached(self) -> bool:
        return self.attempt_count >= _MAX_ATTEMPTS

    @property
    def next_delay_seconds(self) -> int:
        return compute_next_retry_delay(self.attempt_count)

    @property
    def is_retriable(self) -> bool:
        return self.status in (DLQStatus.PENDING, DLQStatus.RETRYING) and not self.max_attempts_reached
