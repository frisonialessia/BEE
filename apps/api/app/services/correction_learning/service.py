"""CorrectionLearningService — captures CEO edits and teaches BEE the user's style.

This is the "intuition" layer: every time the CEO edits a generated artifact,
BEE learns from it. The learning is:

1. **Immediate**: the ``UserStyleProfile`` is updated after each correction.
2. **Cumulative**: rules compound — a pattern confirmed 5 times becomes authoritative.
3. **Automatic**: the ``ExecutiveAgent`` reads ``UserStyleProfile.style_summary``
   and injects it into every generation without any configuration needed.
4. **Transparent**: every correction and rule update is logged to ``AuditTrailService``.

The service is stateless between calls — all learning state lives in the DB.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.correction import ArtifactCorrection, UserStyleProfile
from app.schemas.correction import CorrectionOut, StyleProfileOut
from app.services.correction_learning.diff_engine import (
    compute_change_ratio,
    compute_diff_ops,
    extract_rules_from_ops,
)
from app.services.correction_learning.prompt_adjuster import (
    count_authoritative_rules,
    generate_style_summary,
    merge_rules_into_profile,
)

logger = get_logger(__name__)

_SINGLETON_PROFILE_NOTE = "global"  # One style profile per BEE installation


class CorrectionLearningService:
    """Records CEO corrections on artifacts and evolves the user style profile."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Core learning pipeline ────────────────────────────────────────────────

    def record_correction(
        self,
        original_content: str,
        edited_content: str,
        artifact_type: str,
        opportunity_id: uuid.UUID | None = None,
        lead_id: uuid.UUID | None = None,
        generator_name: str | None = None,
        psychographic_style: str | None = None,
        channel: str | None = None,
    ) -> CorrectionOut:
        """Process a CEO edit and update the style profile.

        Pipeline:
        1. Compute diff ops (what changed and how)
        2. Extract style rules from the diff
        3. Merge rules into the UserStyleProfile (weighted EMA)
        4. Regenerate the style_summary for prompt injection
        5. Record in AuditTrailService
        6. Return the correction record + updated profile summary

        Args:
            original_content: The artifact content as BEE generated it.
            edited_content:   The content after the CEO finished editing.
            artifact_type:    e.g. "email_draft", "meeting_agenda", "linkedin_message"
            opportunity_id:   Associated opportunity UUID.
            lead_id:          Associated lead UUID.
            generator_name:   Which generator produced the original.
            psychographic_style: DISC style of the lead (context for rule weighting).
            channel:          Channel context.

        Returns:
            ``CorrectionOut`` with the correction record and updated style summary.
        """
        # ── Step 1: Diff ──────────────────────────────────────────────────────
        diff_ops = compute_diff_ops(original_content, edited_content)
        extracted_rules = extract_rules_from_ops(diff_ops, artifact_type)
        change_ratio = compute_change_ratio(original_content, edited_content)

        logger.info(
            "Correction recorded: type=%s ops=%d rules=%s change_ratio=%.2f",
            artifact_type, len(diff_ops), extracted_rules, change_ratio,
        )

        # ── Step 2: Persist correction ────────────────────────────────────────
        correction = ArtifactCorrection(
            opportunity_id=opportunity_id,
            lead_id=lead_id,
            artifact_type=artifact_type,
            generator_name=generator_name,
            original_content=original_content,
            edited_content=edited_content,
            diff_ops=diff_ops,
            extracted_rules=extracted_rules,
            change_ratio=change_ratio,
            psychographic_style=psychographic_style,
            channel=channel,
        )
        self.session.add(correction)
        self.session.flush()

        # ── Step 3: Update UserStyleProfile ──────────────────────────────────
        profile = self._get_or_create_profile()
        if extracted_rules:
            updated_rules = merge_rules_into_profile(
                profile.rules,
                artifact_type,
                extracted_rules,
            )
            profile.rules = updated_rules
            profile.style_summary = generate_style_summary(updated_rules)
            profile.authoritative_rules_count = count_authoritative_rules(updated_rules)

        profile.total_corrections += 1
        profile.last_correction_at = datetime.now(UTC).isoformat()
        profile.profile_version += 1
        self.session.add(profile)
        self.session.flush()

        # ── Step 4: Audit trail ───────────────────────────────────────────────
        self._audit_correction(correction, profile)

        return CorrectionOut(
            correction_id=correction.id,
            artifact_type=artifact_type,
            diff_ops=diff_ops,
            extracted_rules=extracted_rules,
            change_ratio=change_ratio,
            style_summary=profile.style_summary,
            authoritative_rules_count=profile.authoritative_rules_count,
            total_corrections=profile.total_corrections,
            profile_version=profile.profile_version,
        )

    # ── Style profile access ─────────────────────────────────────────────────

    def get_style_profile(self) -> StyleProfileOut:
        """Return the current style profile for dashboard display."""
        profile = self._get_or_create_profile()
        return StyleProfileOut(
            total_corrections=profile.total_corrections,
            authoritative_rules_count=profile.authoritative_rules_count,
            style_summary=profile.style_summary,
            profile_version=profile.profile_version,
            last_correction_at=profile.last_correction_at,
            rules_by_type=profile.rules,
        )

    def get_style_summary_for_injection(self, artifact_type: str | None = None) -> str:
        """Return the prompt-ready style summary for the ExecutiveAgent.

        Called by the ExecutiveAgent before generating any artifact.
        Returns empty string if no corrections have been made yet.
        """
        profile = self._get_or_create_profile()
        if not profile.style_summary:
            return ""
        if artifact_type:
            # Generate a type-specific summary
            filtered_rules = {
                k: v for k, v in profile.rules.items()
                if k == artifact_type or k == "all"
            }
            return generate_style_summary(filtered_rules) if filtered_rules else profile.style_summary
        return profile.style_summary

    def list_corrections(
        self,
        artifact_type: str | None = None,
        opportunity_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[ArtifactCorrection]:
        stmt = (
            select(ArtifactCorrection)
            .order_by(ArtifactCorrection.created_at.desc())
            .limit(limit)
        )
        if artifact_type:
            stmt = stmt.where(ArtifactCorrection.artifact_type == artifact_type)
        if opportunity_id:
            stmt = stmt.where(ArtifactCorrection.opportunity_id == opportunity_id)
        return list(self.session.exec(stmt).all())

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _get_or_create_profile(self) -> UserStyleProfile:
        """Return the singleton UserStyleProfile, creating it if it doesn't exist."""
        profiles = list(self.session.exec(select(UserStyleProfile)).all())
        if profiles:
            return profiles[0]
        profile = UserStyleProfile(rules={}, style_summary="", total_corrections=0)
        self.session.add(profile)
        self.session.flush()
        return profile

    def _audit_correction(self, correction: ArtifactCorrection, profile: UserStyleProfile) -> None:
        """Log the correction to the AuditTrailService."""
        try:
            from app.models.audit_trail import AgentType, DecisionType
            from app.services.audit_trail import AuditTrailService

            AuditTrailService(self.session).record_decision(
                agent_type=AgentType.STRATEGY_GENERATOR,
                decision_type=DecisionType.CONTENT_ADAPTED,
                opportunity_id=correction.opportunity_id,
                lead_id=correction.lead_id,
                context_snapshot={
                    "artifact_type": correction.artifact_type,
                    "change_ratio": correction.change_ratio,
                    "diff_ops_count": len(correction.diff_ops),
                    "psychographic_style": correction.psychographic_style,
                },
                market_data_used={
                    "extracted_rules": correction.extracted_rules,
                    "profile_version": profile.profile_version,
                    "authoritative_rules": profile.authoritative_rules_count,
                },
                strategy_reasoning=(
                    f"CEO edited {correction.artifact_type} — {correction.change_ratio:.0%} changed. "
                    f"Learned rules: {', '.join(correction.extracted_rules) or 'none detected'}. "
                    f"Profile now has {profile.authoritative_rules_count} authoritative rule(s). "
                    f"Style summary updated to v{profile.profile_version}."
                ),
                confidence_score=min(1.0, 0.5 + profile.total_corrections * 0.05),
                generator_name="CorrectionLearningService",
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to record correction in audit trail")
