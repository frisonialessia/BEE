"""Schema for GET /internal/jobs/tick — see app.services.external_api.worker's
JobQueueTickSummary (this is its HTTP-response mirror, same relationship
MarketScanTickOut has to market_scan.orchestrator.TickSummary).
"""

from __future__ import annotations

from pydantic import BaseModel


class JobQueueTickOut(BaseModel):
    """``enabled=False`` (every count at 0) is the expected response for
    every tick until ``JOB_QUEUE_BACKEND=redis`` is deliberately
    configured — a successful no-op, not an error."""

    enabled: bool
    processed: int
    rescheduled: int
    dead_lettered: int
    remaining_depth: int
    duration_ms: int
