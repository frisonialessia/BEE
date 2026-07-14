"""AnomalyDetector models — real-time conversion rate monitoring.

The ``AnomalyDetector`` compares rolling conversion rates against historical
baselines. When an anomalous drop is detected, it creates an ``AnomalyAlert``
and a ``PendingAction`` for CEO review. BEE never acts unilaterally — the CEO
must acknowledge or dismiss each alert.

Detection logic
---------------
The detector computes:
  - ``rolling_win_rate``: win rate over the last N opportunities (configurable, default 10)
  - ``baseline_win_rate``: win rate over the historical baseline window (default 90 days)
  - ``deviation_pct``: (rolling - baseline) / baseline × 100

Alert thresholds (deviation_pct relative drop):
  - LOW:      -10% to -20%  → informational, strategy review suggested
  - MEDIUM:   -20% to -35%  → tactical adjustment recommended
  - HIGH:     -35% to -50%  → pause current channel or tactic recommended
  - CRITICAL: > -50%        → immediate strategy review required

Segments monitored
------------------
* Overall conversion rate
* Per-channel (email, linkedin, warm_intro, twitter)
* Per-sector (fintech, saas, retail, ...)
* Per-psychographic-style (D, I, S, C)

Each produces an independent alert so the CEO can identify exactly which
segment is underperforming and what to change.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class AlertSeverity(str):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertType(str):
    CONVERSION_DROP = "conversion_drop"             # Overall win rate dropped
    CHANNEL_UNDERPERFORMANCE = "channel_underperformance"  # Specific channel underperforming
    SECTOR_ANOMALY = "sector_anomaly"               # A sector's conversion dropped
    PSYCHOGRAPHIC_MISMATCH = "psychographic_mismatch"  # A DISC segment is underperforming
    CYCLE_LENGTH_SPIKE = "cycle_length_spike"       # Deal cycles getting longer
    POSITIVE_SPIKE = "positive_spike"               # Unusually good performance (informational)


class AlertStatus(str):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"  # CEO reviewed — no action taken
    ACTED_UPON = "acted_upon"     # CEO approved the recommended action
    DISMISSED = "dismissed"       # CEO dismissed as not relevant
    AUTO_RESOLVED = "auto_resolved"  # Rate recovered automatically


class AnomalyAlert(TimestampMixin, table=True):
    """A detected anomaly in BEE's conversion metrics.

    Created by ``AnomalyDetector.check_all()`` when a significant deviation
    from historical baseline is detected. Always triggers a CEO ``PendingAction``
    for review — BEE never auto-adjusts strategy without approval.
    """

    __tablename__ = "anomaly_alerts"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # ── Alert classification ──────────────────────────────────────────────────
    alert_type: str = Field(index=True)
    severity: str = Field(index=True, default=AlertSeverity.LOW)
    status: str = Field(index=True, default=AlertStatus.OPEN)

    # ── Affected segment ──────────────────────────────────────────────────────
    segment_type: str = Field(description="overall | channel | sector | psychographic | cycle")
    segment_value: str | None = Field(default=None, description="e.g. 'email', 'fintech', 'D'")

    # ── Metrics ───────────────────────────────────────────────────────────────
    rolling_rate: float = Field(description="Current rolling win rate (0.0–1.0)")
    baseline_rate: float = Field(description="Historical baseline win rate (0.0–1.0)")
    deviation_pct: float = Field(description="Relative deviation (negative = drop, positive = spike)")
    sample_size: int = Field(default=0, description="Number of opportunities in the rolling window")
    baseline_sample_size: int = Field(default=0, description="Number of opportunities in the baseline window")

    # ── Recommendation ────────────────────────────────────────────────────────
    title: str = Field(description="Short alert title for CEO display")
    description: str = Field(description="Full explanation of what was detected and why it matters")
    recommendation: str = Field(description="Specific tactical recommendation: pause | switch | review | investigate")
    suggested_actions: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Ordered list of concrete next steps the CEO can take",
    )

    # ── Supporting data ───────────────────────────────────────────────────────
    supporting_data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Raw data snapshot used to generate this alert (for audit trail)",
    )

    # ── CEO action tracking ───────────────────────────────────────────────────
    pending_action_id: uuid.UUID | None = Field(default=None, index=True)
    acknowledged_at: datetime | None = Field(default=None)
    resolution_notes: str | None = Field(default=None)

    # ── Auto-resolution ───────────────────────────────────────────────────────
    resolved_at: datetime | None = Field(default=None)
    auto_resolved: bool = Field(default=False)
