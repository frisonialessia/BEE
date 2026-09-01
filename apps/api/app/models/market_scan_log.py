"""MarketScanLog — audit trail for MarketScanOrchestrator's cron tick.

Not user-facing (no endpoint reads it yet) — this exists so a human can
answer "is the proactive market scan actually running, and is it finding
anything" from the database directly, the same "make the new background
pipeline debuggable from day one" reasoning as AuditEntry for agent
decisions. One row per tick, not per company scanned — see
app.services.market_scan.orchestrator for what a tick does.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class MarketScanLog(TimestampMixin, table=True):
    """One row per MarketScanOrchestrator tick."""

    __tablename__ = "market_scan_logs"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # How many companies were due and picked up by this tick, regardless of
    # whether each one produced a signal — this is "how much work did the
    # tick do," not "how many signals resulted" (see signals_created below
    # for that).
    companies_scanned: int = Field(default=0)
    signals_created: int = Field(default=0)
    # Per-company or per-provider failures that didn't abort the whole tick —
    # one bad provider response must not block the other companies in the
    # same batch. Empty list is the healthy case.
    errors: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    # Wall-clock duration of the tick itself, for keeping batch_size sane
    # against Vercel's maxDuration=60s budget (see apps/api/vercel.json).
    duration_ms: int = Field(default=0)
