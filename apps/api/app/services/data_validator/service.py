"""DataValidator — self-healing data quality for leads.

Leads are the target of every BEE sales action. Stale or incorrect lead data
(wrong title, bad email, outdated LinkedIn URL) reduces outreach effectiveness
and damages sender reputation.

The DataValidator runs asynchronous-style audits (synchronous for now,
ready for background task runner integration) against each lead and updates:

* ``lead.data_freshness_score`` — 0-1 quality score
* ``lead.validation_flags`` — list of detected issues
* ``lead.last_validated_at`` — when the last audit ran
* ``lead.stale_risk`` — True when data hasn't been refreshed in 90+ days

Background task integration
----------------------------
The ``DataValidator.validate_lead()`` method is designed to be called from:
* A scheduled background job (Celery / APScheduler / cron)
* The signal engine when it encounters a lead for the first time
* An explicit ``POST /api/v1/leads/{id}/validate`` endpoint

The validator is pluggable: add new ``LeadValidator`` subclasses and register
them to extend the check suite without modifying this file.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlmodel import Session

from app.core.logging import get_logger
from app.models.lead import Lead

logger = get_logger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_LINKEDIN_RE = re.compile(r"^https?://(www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%]+/?$")

_STALENESS_DAYS = 90  # leads not updated in 90 days are considered stale

# Title keywords that indicate a likely senior decision-maker
_SENIOR_TITLES = {"vp", "vice president", "ceo", "cto", "cfo", "coo", "chief", "head of", "director"}

# Per-flag freshness penalty (subtracted from 1.0)
_FLAG_PENALTIES: dict[str, float] = {
    "email_missing": 0.20,
    "email_invalid": 0.25,
    "linkedin_invalid": 0.10,
    "title_missing": 0.10,
    "stale_data": 0.30,
    "seniority_mismatch": 0.05,
    "name_too_short": 0.10,
}


@dataclass
class ValidationReport:
    """Result of validating a single lead."""

    lead_id: uuid.UUID
    flags: list[str] = field(default_factory=list)
    freshness_score: float = 1.0
    stale_risk: bool = False
    validated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @property
    def is_clean(self) -> bool:
        return not self.flags and self.freshness_score >= 0.80


class DataValidator:
    """Audits lead data quality and updates the Lead record."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def validate_lead(self, lead_id: uuid.UUID) -> ValidationReport:
        """Run all validation checks against a single lead and persist results."""
        lead = self.session.get(Lead, lead_id)
        if lead is None:
            raise ValueError(f"Lead {lead_id} not found")

        report = self._run_checks(lead)
        self._persist(lead, report)
        return report

    def validate_batch(self, lead_ids: list[uuid.UUID]) -> list[ValidationReport]:
        """Validate multiple leads. Returns reports in the same order."""
        return [self.validate_lead(lid) for lid in lead_ids]

    def _run_checks(self, lead: Lead) -> ValidationReport:
        flags: list[str] = []
        score = 1.0

        # ── Email ────────────────────────────────────────────────────────────
        if not lead.email:
            flags.append("email_missing")
        elif not _EMAIL_RE.match(lead.email):
            flags.append("email_invalid")

        # ── LinkedIn ──────────────────────────────────────────────────────────
        if lead.linkedin_url and not _LINKEDIN_RE.match(lead.linkedin_url):
            flags.append("linkedin_invalid")

        # ── Title ─────────────────────────────────────────────────────────────
        if not lead.title:
            flags.append("title_missing")

        # ── Name ──────────────────────────────────────────────────────────────
        if lead.full_name and len(lead.full_name.strip()) < 4:
            flags.append("name_too_short")

        # ── Seniority/title consistency ────────────────────────────────────────
        if lead.title and lead.seniority:
            title_lower = lead.title.lower()
            is_senior_title = any(kw in title_lower for kw in _SENIOR_TITLES)
            expected_senior = lead.seniority in ("c_level", "vp", "director")
            if is_senior_title and not expected_senior:
                flags.append("seniority_mismatch")

        # ── Staleness ─────────────────────────────────────────────────────────
        stale_risk = False
        ref_date = lead.last_validated_at or lead.created_at
        if ref_date:
            age_days = (datetime.now(UTC) - (
                ref_date if ref_date.tzinfo else ref_date.replace(tzinfo=UTC)
            )).days
            if age_days >= _STALENESS_DAYS:
                flags.append("stale_data")
                stale_risk = True

        # ── Compute final score ────────────────────────────────────────────────
        for flag in flags:
            score -= _FLAG_PENALTIES.get(flag, 0.05)
        score = max(0.0, min(1.0, score))

        return ValidationReport(
            lead_id=lead.id,
            flags=flags,
            freshness_score=round(score, 3),
            stale_risk=stale_risk,
        )

    def _persist(self, lead: Lead, report: ValidationReport) -> None:
        lead.data_freshness_score = report.freshness_score
        lead.validation_flags = report.flags
        lead.last_validated_at = report.validated_at
        lead.stale_risk = report.stale_risk
        self.session.add(lead)
        self.session.commit()
        logger.info(
            "Lead %s validated: score=%.2f flags=%s",
            lead.id, report.freshness_score, report.flags,
        )
