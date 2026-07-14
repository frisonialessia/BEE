"""AnomalyDetector API — conversion rate monitoring and strategy alerts."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.anomaly import AnomalyAcknowledgeRequest, AnomalyAlertOut, AnomalyCheckResult
from app.services.anomaly_detector import AnomalyDetector

router = APIRouter(prefix="/analytics", tags=["Anomaly Detector (Monitoring)"])


def _get_detector(session: Session = Depends(get_session)) -> AnomalyDetector:
    return AnomalyDetector(session)


@router.post(
    "/anomalies/check",
    response_model=AnomalyCheckResult,
    summary="Run anomaly detection across all conversion rate segments",
)
def check_anomalies(
    detector: AnomalyDetector = Depends(_get_detector),
    session: Session = Depends(get_session),
) -> AnomalyCheckResult:
    """Trigger a full anomaly detection run.

    Compares rolling conversion rates (last 10 outcomes) against historical
    baselines (last 90 days) for:
    - Overall conversion rate
    - Per-channel (email, linkedin, warm_intro, twitter)
    - Per-sector (fintech, saas, retail, ...)

    When a significant drop is detected:
    - An ``AnomalyAlert`` is created with severity, description, and recommendations
    - A ``PendingAction`` is created for HIGH/CRITICAL alerts for CEO review
    - The detection is logged to ``AuditTrailService``

    Auto-resolution: if a previously open alert's segment has recovered (within
    10% of baseline), it is automatically resolved.

    In production, this endpoint is called:
    - After every WON/LOST outcome recording (via FeedbackLoopService hook)
    - By a scheduled job every hour
    """
    result = detector.check_all()
    session.commit()
    return result


@router.get(
    "/anomalies",
    response_model=list[AnomalyAlertOut],
    summary="List anomaly alerts",
)
def list_anomaly_alerts(
    status: str | None = Query(default=None, description="Filter by status: open | acknowledged | acted_upon | dismissed | auto_resolved"),
    severity: str | None = Query(default=None, description="Filter by severity: low | medium | high | critical"),
    limit: int = Query(default=50, le=200),
    detector: AnomalyDetector = Depends(_get_detector),
) -> list[AnomalyAlertOut]:
    """List anomaly alerts.

    Default: returns all alerts ordered by creation time (newest first).
    Filter by ``status=open`` to see only unresolved alerts.
    Filter by ``severity=critical`` to see only critical alerts.
    """
    alerts = detector.list_alerts(status=status, severity=severity, limit=limit)
    return [AnomalyAlertOut.model_validate(a) for a in alerts]


@router.post(
    "/anomalies/{alert_id}/acknowledge",
    response_model=AnomalyAlertOut,
    summary="Acknowledge an anomaly alert (reviewed, no action taken)",
)
def acknowledge_alert(
    alert_id: uuid.UUID,
    body: AnomalyAcknowledgeRequest,
    detector: AnomalyDetector = Depends(_get_detector),
    session: Session = Depends(get_session),
) -> AnomalyAlertOut:
    """CEO acknowledges an alert — marks it as reviewed without taking action.

    Use this when the CEO has reviewed the alert and decided no tactical change
    is needed (e.g., the drop is expected due to seasonal factors).

    For acting on the recommendation, approve the associated ``PendingAction``
    through the orchestrator endpoint.
    """
    from fastapi import HTTPException
    from fastapi import status as http_status

    alert = detector.acknowledge_alert(alert_id, notes=body.notes)
    if not alert:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Alert not found")
    session.commit()
    return AnomalyAlertOut.model_validate(alert)
