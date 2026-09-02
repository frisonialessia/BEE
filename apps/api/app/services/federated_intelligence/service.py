"""FederatedSignalIntelligenceService — privacy-preserving cross-tenant
signal calibration.

Every organization in BEE learns only from its own history today —
``FeedbackLoopService`` computes win-rate hints from that org's own
``StrategyOutcome`` rows, and a brand-new tenant starts with none. This
service turns BEE's strict multi-tenant isolation from a cold-start problem
into a network effect: organizations that opt in contribute *anonymized,
aggregate-only* statistics — never raw signal, company, or lead data, never
even visible per-organization — that calibrate every other opted-in
organization's own signal confidence.

What is and is never shared
----------------------------
``StrategyOutcome`` already denormalizes exactly the four dimensions this
needs (see that model's own docstring: "BEE's competitive moat... a growing,
labeled dataset of what strategies win in which contexts") — ``signal_type``,
``company_industry``, and ``outcome`` (won/lost), scoped by
``organization_id``. This service never introduces a new table or a new
write path: it reads that existing, already-populated data at query time,
filtered to rows belonging to an organization with
``federated_intelligence_opt_in=True``, and returns only an aggregate
(win_rate, sample_size, contributing_orgs) — never a row, never a company
name, never which organization contributed what.

The k-anonymity floor (``MIN_CONTRIBUTING_ORGS``) is the hard guarantee: a
prior is computed only once at least that many *distinct* organizations
have contributed to the bucket, so no aggregate can ever be reverse-engineered
to a single org's — or a small clique's — own history. Below that floor this
returns ``None``, not a statistic computed from too little data passed off
as confident.

Reciprocity, not free-riding
------------------------------
``calibrate_confidence`` only calibrates for an organization that has
*itself* opted in (see ``is_opted_in``) — a non-participating org neither
contributes to nor benefits from the shared pool. This keeps the incentive
aligned (opting in is what unlocks the smarter scoring) and sidesteps a
harder question this MVP deliberately doesn't answer: whether a
non-contributing org should still get to read the aggregate.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlmodel import Session, select

from app.core.config import settings as _settings
from app.core.logging import get_logger
from app.models.organization import Organization
from app.models.strategy_outcome import StrategyOutcome

logger = get_logger(__name__)

# A federated prior is only ever returned once at least this many DISTINCT
# organizations have contributed to the (signal_type, industry) bucket.
# Sourced from Settings.FEDERATED_INTELLIGENCE_MIN_CONTRIBUTING_ORGS
# (env-configurable, ge=2 enforced there) rather than hardcoded here, so an
# operator can raise the floor as the fleet grows without a code change —
# see that setting's own comment for the early-pilot-vs-mature-fleet
# tradeoff. Read once at import time, same "settle the value at process
# start" convention as every other module-level constant derived from
# Settings in this codebase.
MIN_CONTRIBUTING_ORGS = _settings.FEDERATED_INTELLIGENCE_MIN_CONTRIBUTING_ORGS

# Caps how far a cross-tenant prior can move an org's own analyzer
# confidence — it augments a single org's judgment, it never overrides it.
# The weight approaches (but never reaches) this cap as sample_size grows,
# per the half-life shrinkage in calibrate_confidence.
_MAX_PRIOR_WEIGHT = 0.3
_PRIOR_WEIGHT_HALF_LIFE = 50  # sample_size at which weight reaches half of _MAX_PRIOR_WEIGHT


@dataclass(slots=True)
class FederatedPrior:
    """An anonymized, aggregate-only cross-tenant statistic. Never carries
    anything more specific than these three numbers — no org identifiers,
    no company/lead data, no individual outcomes."""

    win_rate: float
    sample_size: int
    contributing_orgs: int


class FederatedSignalIntelligenceService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def is_opted_in(self, organization_id: uuid.UUID | None) -> bool:
        if organization_id is None:
            return False
        org = self.session.get(Organization, organization_id)
        return bool(org is not None and org.federated_intelligence_opt_in)

    def get_prior(self, signal_type: str, industry: str | None) -> FederatedPrior | None:
        """Aggregate win-rate for this (signal_type, industry) bucket,
        across every opted-in organization's StrategyOutcome history.
        Returns ``None`` — never ``0.0`` — when the bucket hasn't cleared
        the k-anonymity floor: "not enough data to be safe" and "no signal"
        must never be conflated, the same "missing != zero" rule the rest
        of this codebase's win-rate aggregation already follows (see
        FeedbackLoopService).
        """
        statement = (
            select(StrategyOutcome.organization_id, StrategyOutcome.outcome)
            .join(Organization, Organization.id == StrategyOutcome.organization_id)
            .where(
                StrategyOutcome.signal_type == signal_type,
                Organization.federated_intelligence_opt_in.is_(True),  # type: ignore[attr-defined]
            )
        )
        statement = (
            statement.where(StrategyOutcome.company_industry == industry)
            if industry is not None
            else statement.where(StrategyOutcome.company_industry.is_(None))
        )

        rows = self.session.exec(statement).all()
        if not rows:
            return None

        contributing_orgs = {org_id for org_id, _ in rows}
        if len(contributing_orgs) < MIN_CONTRIBUTING_ORGS:
            return None

        total = len(rows)
        won = sum(1 for _, outcome in rows if outcome == "won")
        return FederatedPrior(
            win_rate=won / total,
            sample_size=total,
            contributing_orgs=len(contributing_orgs),
        )

    def calibrate_confidence(
        self,
        *,
        organization_id: uuid.UUID | None,
        signal_type: str,
        industry: str | None,
        base_confidence: float,
    ) -> tuple[float, FederatedPrior | None]:
        """Blend ``base_confidence`` with the cross-tenant prior, when this
        organization has opted in and the bucket clears the k-anonymity
        floor. Never raises — any failure here must fall back to the
        analyzer's own unmodified confidence, never block signal ingestion.
        Returns ``(confidence, prior_used_or_None)`` so the caller can
        record what influenced the decision (see SignalEngine, which stores
        it on ``Signal.analysis`` for auditability).
        """
        try:
            return self._calibrate(organization_id, signal_type, industry, base_confidence)
        except Exception:  # noqa: BLE001
            logger.exception(
                "FederatedSignalIntelligenceService.calibrate_confidence failed — "
                "leaving confidence unmodified"
            )
            return base_confidence, None

    def _calibrate(
        self,
        organization_id: uuid.UUID | None,
        signal_type: str,
        industry: str | None,
        base_confidence: float,
    ) -> tuple[float, FederatedPrior | None]:
        if not self.is_opted_in(organization_id):
            return base_confidence, None

        prior = self.get_prior(signal_type, industry)
        if prior is None:
            return base_confidence, None

        weight = _MAX_PRIOR_WEIGHT * (
            prior.sample_size / (prior.sample_size + _PRIOR_WEIGHT_HALF_LIFE)
        )
        calibrated = base_confidence * (1 - weight) + prior.win_rate * weight
        return max(0.0, min(1.0, calibrated)), prior
