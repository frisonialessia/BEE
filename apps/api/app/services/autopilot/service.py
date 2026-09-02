"""AutopilotGuardrailService — the confidence/exclusion/forbidden-word gate
consulted by OmnichannelGateway.prepare_action() before deciding whether a
PendingAction can skip PENDING_APPROVAL.

`evaluate()` is a pure decision function: it never raises, never mutates
anything, and always returns a reasoned AutopilotDecision — the caller
decides what to do with it (OmnichannelGateway auto-approves; nothing else
in this codebase currently calls it, so today this is a fully-built,
fully-tested, dormant mechanism until a caller opts in by passing
confidence_score/organization_id to prepare_action).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.autopilot_config import AutopilotConfig
from app.schemas.autopilot import AutopilotConfigIn

logger = get_logger(__name__)


@dataclass(slots=True)
class AutopilotDecision:
    """The verdict on one candidate action, plus the human-readable reason
    — never a bare boolean. Logged verbatim to the audit trail on approval,
    and useful for debugging a "why didn't this auto-approve" question."""

    auto_approve: bool
    reason: str


class AutopilotGuardrailService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Config CRUD ──────────────────────────────────────────────────────────

    def get_config(self, organization_id: uuid.UUID) -> AutopilotConfig | None:
        return self.session.exec(
            select(AutopilotConfig).where(AutopilotConfig.organization_id == organization_id)
        ).first()

    def create_or_update(self, organization_id: uuid.UUID, data: AutopilotConfigIn) -> AutopilotConfig:
        existing = self.get_config(organization_id)
        excluded = [str(c) for c in data.excluded_company_ids]

        if existing is not None:
            existing.enabled = data.enabled
            existing.confidence_threshold = data.confidence_threshold
            existing.excluded_company_ids = excluded
            existing.forbidden_words = data.forbidden_words
            config = existing
        else:
            config = AutopilotConfig(
                organization_id=organization_id,
                enabled=data.enabled,
                confidence_threshold=data.confidence_threshold,
                excluded_company_ids=excluded,
                forbidden_words=data.forbidden_words,
            )

        self.session.add(config)
        self.session.flush()
        self.session.refresh(config)
        logger.info(
            "AutopilotConfig saved: org=%s enabled=%s threshold=%.2f excluded=%d forbidden_words=%d",
            organization_id, config.enabled, config.confidence_threshold,
            len(config.excluded_company_ids), len(config.forbidden_words),
        )
        return config

    # ── The guardrail decision ──────────────────────────────────────────────

    def evaluate(
        self,
        organization_id: uuid.UUID | None,
        *,
        confidence_score: float | None,
        company_id: uuid.UUID | None = None,
        content: str = "",
    ) -> AutopilotDecision:
        """Never raises — any failure here must fall back to requiring human
        approval, never the reverse."""
        try:
            return self._evaluate(organization_id, confidence_score, company_id, content)
        except Exception:  # noqa: BLE001
            logger.exception("AutopilotGuardrailService.evaluate failed — defaulting to manual approval")
            return AutopilotDecision(False, "guardrail evaluation failed — defaulting to manual approval")

    def _evaluate(
        self,
        organization_id: uuid.UUID | None,
        confidence_score: float | None,
        company_id: uuid.UUID | None,
        content: str,
    ) -> AutopilotDecision:
        if organization_id is None:
            return AutopilotDecision(False, "no organization context")

        config = self.get_config(organization_id)
        if config is None or not config.enabled:
            return AutopilotDecision(False, "autopilot is not enabled for this organization")

        if confidence_score is None:
            return AutopilotDecision(False, "no confidence score available for this action")

        if confidence_score < config.confidence_threshold:
            return AutopilotDecision(
                False,
                f"confidence {confidence_score:.2f} is below this org's threshold "
                f"({config.confidence_threshold:.2f})",
            )

        if company_id is not None and str(company_id) in config.excluded_company_ids:
            return AutopilotDecision(False, "this account is on the protected/excluded list")

        content_lower = content.lower()
        for word in config.forbidden_words:
            if word and word.lower() in content_lower:
                return AutopilotDecision(False, f"content contains a forbidden word ({word!r})")

        return AutopilotDecision(
            True,
            f"confidence {confidence_score:.2f} >= threshold {config.confidence_threshold:.2f}, "
            "account not excluded, no forbidden words matched",
        )
