"""AnomalyDetector — real-time conversion rate monitoring and strategy alerts.

Compares rolling conversion metrics against historical baselines to detect
statistically significant performance anomalies. When detected, it:

1. Creates an ``AnomalyAlert`` with severity, recommendation, and suggested actions.
2. Creates a ``PendingAction`` for CEO review (never auto-adjusts strategy).
3. Logs the detection to ``AuditTrailService`` for full transparency.

Detection algorithm
-------------------
For each monitored segment (overall, per-channel, per-sector, per-DISC):

1. Compute ``rolling_win_rate`` from the last ``ROLLING_WINDOW`` closed opportunities
2. Compute ``baseline_win_rate`` from the last ``BASELINE_DAYS`` of outcomes
3. Compute relative deviation: ``(rolling - baseline) / baseline``
4. If |deviation| > threshold → create alert

Thresholds:
  LOW:      ±10–20% deviation
  MEDIUM:   ±20–35% deviation
  HIGH:     ±35–50% deviation
  CRITICAL: > ±50% deviation

Auto-resolution
---------------
When the ``AnomalyDetector`` runs and finds that a previously OPEN alert has
recovered (current rate back within 10% of baseline), it auto-resolves the alert
without requiring CEO action.

Integration points
------------------
The detector is triggered:
* On-demand: ``POST /api/v1/analytics/anomalies/check``
* After every WON/LOST outcome recording (via FeedbackLoopService hook)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.anomaly import AlertSeverity, AlertStatus, AlertType, AnomalyAlert
from app.schemas.anomaly import AnomalyAlertOut, AnomalyCheckResult

logger = get_logger(__name__)

# ── Detection parameters ──────────────────────────────────────────────────────
_ROLLING_WINDOW = 10          # Last N opportunities for rolling rate
_BASELINE_DAYS = 90           # Days of history for baseline
_MIN_SAMPLE = 3               # Below this → skip detection (too noisy)

_THRESHOLDS = {
    AlertSeverity.CRITICAL: 0.50,
    AlertSeverity.HIGH:     0.35,
    AlertSeverity.MEDIUM:   0.20,
    AlertSeverity.LOW:      0.10,
}


def _classify_severity(deviation: float) -> str:
    abs_dev = abs(deviation)
    if abs_dev >= _THRESHOLDS[AlertSeverity.CRITICAL]:
        return AlertSeverity.CRITICAL
    if abs_dev >= _THRESHOLDS[AlertSeverity.HIGH]:
        return AlertSeverity.HIGH
    if abs_dev >= _THRESHOLDS[AlertSeverity.MEDIUM]:
        return AlertSeverity.MEDIUM
    return AlertSeverity.LOW


class AnomalyDetector:
    """Monitors BEE conversion metrics and fires strategy alerts on anomalies."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Main detection entry point ────────────────────────────────────────────

    def check_all(self) -> AnomalyCheckResult:
        """Run all anomaly checks and return a comprehensive report.

        Checks:
        * Overall conversion rate
        * Per-channel breakdown
        * Per-sector breakdown
        """
        from app.models.strategy_outcome import StrategyOutcome

        now = datetime.now(UTC)
        baseline_start = now - timedelta(days=_BASELINE_DAYS)

        # Load all outcomes for analysis
        all_outcomes = list(self.session.exec(select(StrategyOutcome)).all())

        if len(all_outcomes) < _MIN_SAMPLE:
            logger.info("AnomalyDetector: insufficient data (n=%d), skipping", len(all_outcomes))
            return AnomalyCheckResult(
                checked_at=now.isoformat(),
                new_alerts=[],
                resolved_alerts=[],
                open_alerts=self._get_open_alerts(),
                summary="Insufficient historical data for anomaly detection (need at least 3 outcomes).",
                checked_segments=0,
            )

        new_alerts: list[AnomalyAlert] = []
        resolved_count = 0

        # ── Overall conversion rate ───────────────────────────────────────────
        overall_alert = self._check_segment(
            all_outcomes, baseline_start,
            segment_type="overall", segment_value=None,
            alert_type=AlertType.CONVERSION_DROP,
        )
        if overall_alert:
            new_alerts.append(overall_alert)

        # ── Per-channel breakdown ─────────────────────────────────────────────
        channels = {o.channel for o in all_outcomes if o.channel}
        for channel in channels:
            channel_outcomes = [o for o in all_outcomes if o.channel == channel]
            if len(channel_outcomes) < _MIN_SAMPLE:
                continue
            alert = self._check_segment(
                channel_outcomes, baseline_start,
                segment_type="channel", segment_value=channel,
                alert_type=AlertType.CHANNEL_UNDERPERFORMANCE,
            )
            if alert:
                new_alerts.append(alert)

        # ── Per-sector breakdown ──────────────────────────────────────────────
        sectors = {o.industry for o in all_outcomes if o.industry}
        for sector in sectors:
            sector_outcomes = [o for o in all_outcomes if o.industry == sector]
            if len(sector_outcomes) < _MIN_SAMPLE:
                continue
            alert = self._check_segment(
                sector_outcomes, baseline_start,
                segment_type="sector", segment_value=sector,
                alert_type=AlertType.SECTOR_ANOMALY,
            )
            if alert:
                new_alerts.append(alert)

        # ── Auto-resolve recovered alerts ─────────────────────────────────────
        resolved_count = self._auto_resolve_recovered(all_outcomes, baseline_start)

        # ── Flush new alerts ──────────────────────────────────────────────────
        for alert in new_alerts:
            self.session.add(alert)
        self.session.flush()

        # ── Create CEO PendingActions for new high-severity alerts ────────────
        for alert in new_alerts:
            if alert.severity in (AlertSeverity.HIGH, AlertSeverity.CRITICAL):
                self._create_ceo_alert(alert)

        # ── Audit trail ───────────────────────────────────────────────────────
        if new_alerts:
            self._audit_detection(new_alerts)

        open_alerts = self._get_open_alerts()
        segments_checked = 1 + len(channels) + len(sectors)

        return AnomalyCheckResult(
            checked_at=now.isoformat(),
            new_alerts=[AnomalyAlertOut.model_validate(a) for a in new_alerts],
            resolved_alerts=[],
            open_alerts=[AnomalyAlertOut.model_validate(a) for a in open_alerts],
            summary=self._build_summary(new_alerts, resolved_count, open_alerts),
            checked_segments=segments_checked,
        )

    # ── Segment analysis ─────────────────────────────────────────────────────

    def _check_segment(
        self,
        outcomes: list,
        baseline_start: datetime,
        segment_type: str,
        segment_value: str | None,
        alert_type: str,
    ) -> AnomalyAlert | None:
        """Check one segment for anomalies. Returns an AnomalyAlert or None."""
        # Separate rolling (recent) from baseline (historical)
        rolling = outcomes[-_ROLLING_WINDOW:] if len(outcomes) >= _ROLLING_WINDOW else outcomes
        now = datetime.now(UTC)

        baseline_outcomes = [
            o for o in outcomes
            if o.created_at and self._is_in_baseline(o.created_at, baseline_start, now)
        ]

        if len(rolling) < _MIN_SAMPLE or len(baseline_outcomes) < _MIN_SAMPLE:
            return None

        rolling_won = sum(1 for o in rolling if o.outcome == "WON")
        rolling_rate = rolling_won / len(rolling)

        baseline_won = sum(1 for o in baseline_outcomes if o.outcome == "WON")
        baseline_rate = baseline_won / len(baseline_outcomes)

        if baseline_rate == 0:
            return None

        deviation = (rolling_rate - baseline_rate) / baseline_rate

        # Only alert on drops (negative deviation) for now
        # Positive spikes are informational (POSITIVE_SPIKE type)
        if deviation >= -_THRESHOLDS[AlertSeverity.LOW]:
            return None

        # Check if an active alert already exists for this segment
        existing = self._get_active_alert(segment_type, segment_value)
        if existing:
            return None  # Alert already open — don't duplicate

        severity = _classify_severity(deviation)
        title, description, recommendation, actions = self._build_recommendation(
            severity, deviation, segment_type, segment_value, rolling_rate, baseline_rate
        )

        return AnomalyAlert(
            alert_type=alert_type,
            severity=severity,
            status=AlertStatus.OPEN,
            segment_type=segment_type,
            segment_value=segment_value,
            rolling_rate=round(rolling_rate, 4),
            baseline_rate=round(baseline_rate, 4),
            deviation_pct=round(deviation * 100, 2),
            sample_size=len(rolling),
            baseline_sample_size=len(baseline_outcomes),
            title=title,
            description=description,
            recommendation=recommendation,
            suggested_actions=actions,
            supporting_data={
                "rolling_won": rolling_won,
                "rolling_total": len(rolling),
                "baseline_won": baseline_won,
                "baseline_total": len(baseline_outcomes),
            },
        )

    def _build_recommendation(
        self,
        severity: str,
        deviation: float,
        segment_type: str,
        segment_value: str | None,
        rolling_rate: float,
        baseline_rate: float,
    ) -> tuple[str, str, str, list[str]]:
        """Generate human-readable recommendation for an anomaly."""
        pct_drop = abs(deviation * 100)
        segment_desc = f"{segment_value} {segment_type}" if segment_value else segment_type

        title = f"{'🚨' if severity == AlertSeverity.CRITICAL else '⚠️'} {severity.upper()}: {pct_drop:.0f}% conversion drop in {segment_desc}"

        description = (
            f"Rolling win rate for {segment_desc}: {rolling_rate:.1%} (last {_ROLLING_WINDOW} opportunities). "
            f"Historical baseline (90d): {baseline_rate:.1%}. "
            f"Relative drop: {pct_drop:.0f}%. "
        )

        if severity == AlertSeverity.CRITICAL:
            recommendation = "immediate_review"
            description += "Immediate strategy review required — performance has collapsed."
            actions = [
                "Pause outreach in this segment temporarily",
                "Review last 5 closed-lost opportunities for patterns",
                "Check if competitive dynamics or market conditions changed",
                "Consider A/B testing a completely different approach",
            ]
        elif severity == AlertSeverity.HIGH:
            recommendation = "pause_and_switch"
            description += "Significant underperformance — tactical change recommended."
            actions = [
                "Switch primary channel for this segment",
                "Review message tone — may need DISC style adjustment",
                "Run TrendAnalyst to check for market signal changes",
                "Consider activating warm_intro channel if connections available",
            ]
        elif severity == AlertSeverity.MEDIUM:
            recommendation = "adjust_tactics"
            description += "Noticeable underperformance — tactical adjustment suggested."
            actions = [
                "Review messaging and DISC tone alignment",
                "Check if dark funnel signals are still generating quality leads",
                "A/B test message variation in this segment",
            ]
        else:
            recommendation = "monitor"
            description += "Early warning signal — monitoring recommended."
            actions = [
                "Monitor for 5 more closed opportunities before acting",
                "Review message content for this segment",
            ]

        return title, description, recommendation, actions

    # ── Auto-resolution ───────────────────────────────────────────────────────

    def _auto_resolve_recovered(self, all_outcomes: list, baseline_start: datetime) -> int:  # noqa: ARG002
        """Auto-resolve alerts where the segment has recovered to within 10% of baseline."""
        open_alerts = self._get_open_alerts()
        resolved = 0
        now = datetime.now(UTC)

        for alert in open_alerts:
            segment_outcomes = [
                o for o in all_outcomes
                if alert.segment_type == "overall" or (
                    alert.segment_type == "channel" and o.channel == alert.segment_value
                ) or (
                    alert.segment_type == "sector" and o.industry == alert.segment_value
                )
            ]
            if len(segment_outcomes) < _MIN_SAMPLE:
                continue

            rolling = segment_outcomes[-_ROLLING_WINDOW:]
            rolling_won = sum(1 for o in rolling if o.outcome == "WON")
            rolling_rate = rolling_won / max(len(rolling), 1)

            # Recover if within 10% of baseline
            if abs(rolling_rate - alert.baseline_rate) / max(alert.baseline_rate, 0.01) < 0.10:
                alert.status = AlertStatus.AUTO_RESOLVED
                alert.auto_resolved = True
                alert.resolved_at = now
                alert.resolution_notes = f"Auto-resolved: win rate recovered to {rolling_rate:.1%}"
                self.session.add(alert)
                resolved += 1
                logger.info("AnomalyAlert %s auto-resolved (rate recovered to %.1%)", alert.id, rolling_rate)

        return resolved

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _get_active_alert(self, segment_type: str, segment_value: str | None) -> AnomalyAlert | None:
        stmt = (
            select(AnomalyAlert)
            .where(AnomalyAlert.segment_type == segment_type)
            .where(AnomalyAlert.status == AlertStatus.OPEN)
        )
        if segment_value:
            stmt = stmt.where(AnomalyAlert.segment_value == segment_value)
        return self.session.exec(stmt).first()

    def _get_open_alerts(self) -> list[AnomalyAlert]:
        return list(
            self.session.exec(
                select(AnomalyAlert)
                .where(AnomalyAlert.status == AlertStatus.OPEN)
                .order_by(AnomalyAlert.created_at.desc())
            ).all()
        )

    def list_alerts(
        self,
        status: str | None = None,
        severity: str | None = None,
        limit: int = 50,
    ) -> list[AnomalyAlert]:
        stmt = select(AnomalyAlert).order_by(AnomalyAlert.created_at.desc()).limit(limit)
        if status:
            stmt = stmt.where(AnomalyAlert.status == status)
        if severity:
            stmt = stmt.where(AnomalyAlert.severity == severity)
        return list(self.session.exec(stmt).all())

    def acknowledge_alert(self, alert_id: uuid.UUID, notes: str | None = None) -> AnomalyAlert | None:
        """CEO acknowledges an alert — marks as reviewed but no action taken."""
        alert = self.session.get(AnomalyAlert, alert_id)
        if not alert:
            return None
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.now(UTC)
        alert.resolution_notes = notes or "Acknowledged by CEO"
        self.session.add(alert)
        self.session.flush()
        logger.info("AnomalyAlert %s acknowledged", alert_id)
        return alert

    def _is_in_baseline(self, created_at: datetime, start: datetime, end: datetime) -> bool:
        """Check if a datetime falls within the baseline window (timezone-safe)."""
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        return start <= created_at <= end

    def _create_ceo_alert(self, alert: AnomalyAlert) -> None:
        """Create a PendingAction to notify the CEO."""
        try:
            from app.models.base import ActionStatus, ActionType
            from app.models.pending_action import PendingAction

            action = PendingAction(
                action_type=ActionType.WEBHOOK_CALL,
                status=ActionStatus.PENDING_APPROVAL,
                title=alert.title,
                description=alert.description + f"\n\nRecommendation: {alert.recommendation}\n" + "\n".join(f"• {a}" for a in alert.suggested_actions),
                priority=1 if alert.severity == AlertSeverity.CRITICAL else 2,
                metadata={"anomaly_alert_id": str(alert.id), "severity": alert.severity},
            )
            self.session.add(action)
            self.session.flush()
            alert.pending_action_id = action.id
            self.session.add(alert)
            self.session.flush()
        except Exception:  # noqa: BLE001
            logger.exception("Failed to create CEO alert for anomaly %s", alert.id)

    def _audit_detection(self, alerts: list[AnomalyAlert]) -> None:
        """Log anomaly detection to AuditTrailService."""
        try:
            from app.models.audit_trail import AgentType, DecisionType
            from app.services.audit_trail import AuditTrailService

            audit = AuditTrailService(self.session)
            for alert in alerts:
                audit.record_decision(
                    agent_type=AgentType.WORKFLOW_ORCHESTRATOR,
                    decision_type=DecisionType.REVIEW_FLAGGED,
                    context_snapshot={
                        "segment_type": alert.segment_type,
                        "segment_value": alert.segment_value,
                        "rolling_rate": alert.rolling_rate,
                        "baseline_rate": alert.baseline_rate,
                        "deviation_pct": alert.deviation_pct,
                        "sample_size": alert.sample_size,
                    },
                    strategy_reasoning=alert.description,
                    confidence_score=0.85 if alert.sample_size >= 10 else 0.60,
                    generator_name="AnomalyDetector",
                )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to audit anomaly detection")

    def _build_summary(
        self,
        new_alerts: list[AnomalyAlert],
        resolved_count: int,
        open_alerts: list[AnomalyAlert],
    ) -> str:
        parts = []
        if new_alerts:
            critical = sum(1 for a in new_alerts if a.severity == AlertSeverity.CRITICAL)
            high = sum(1 for a in new_alerts if a.severity == AlertSeverity.HIGH)
            parts.append(f"Detected {len(new_alerts)} new anomaly alert(s) ({critical} critical, {high} high).")
        if resolved_count:
            parts.append(f"{resolved_count} alert(s) auto-resolved (performance recovered).")
        if open_alerts:
            parts.append(f"{len(open_alerts)} alert(s) still open — CEO review pending.")
        if not parts:
            parts.append("All segments within normal parameters — no anomalies detected.")
        return " ".join(parts)
