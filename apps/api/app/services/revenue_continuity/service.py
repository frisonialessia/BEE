"""RevenueContinuityService — the Revenue Continuity Radar.

Every other agent in this codebase stops caring about an account the moment
its opportunity closes: ``FeedbackLoopService.record_outcome`` writes the
WON/LOST outcome and that is the last anything in BEE ever does with that
account. Nothing re-engages it. A funding round, a hiring spree, or a
champion's departure at an *existing customer* is ingested, scored, and
turned into an opportunity by the exact same pipeline as a net-new
prospect — with nothing to tell a rep "this is an upsell signal on a
customer" apart from "this is our normal net-new motion."

This service closes that gap without a new ingestion pipeline, a new
signal type, or a new analyzer: it reuses ``SignalEngine``'s existing
analyzer output and only adds one classification step at the moment an
``Opportunity`` is about to be created (see
``SignalEngine._create_opportunity``) — did the signal's ``company_id``
already have a WON opportunity, and if so, does the signal's type suggest
growth (``EXPANSION``) or risk (``RENEWAL_RISK``)? Everything else about
opportunity creation, scoring, and battlecard generation is unchanged.

Classification rules (MVP seed set)
------------------------------------
A company with no prior WON opportunity is always ``NEW_LOGO`` — the
existing acquisition motion is untouched by this service's existence.

For a company that already has a WON opportunity, the triggering
``SignalType`` decides the bucket:

* ``RENEWAL_RISK_SIGNAL_TYPES`` — signals that suggest the account may
  churn: today just ``LEADERSHIP_CHANGE`` (the champion may be leaving).
  Deliberately narrow rather than broad — a false "at risk" flag erodes
  trust in this feature faster than a missed one does.
* ``EXPANSION_SIGNAL_TYPES`` — signals that suggest the account is
  growing and may be ready for upsell: funding, hiring, new locations,
  new product launches, grants.
* Anything else on an existing customer still creates an opportunity
  exactly as before, just labeled ``NEW_LOGO`` — this is a starting seed
  set, not a claim that every signal type has been triaged. Both sets are
  a single source of truth to extend: add a ``SignalType`` to either one,
  no other code changes (same Open/Closed shape as the analyzer registry).

Deliberately out of scope for this first pass — the natural next
increment, not because it's hard, just to keep this change small and
provably safe: ``StrategyGeneratorService`` still runs the same
new-logo-oriented playbooks regardless of ``opportunity_type``. Teaching
it an upsell/retention playbook per bucket is a separate, focused change.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from app.core.logging import get_logger
from app.models.base import (
    EXPANSION,
    NEW_LOGO,
    RENEWAL_RISK,
    SignalType,
)
from app.repositories.opportunity import OpportunityRepository

logger = get_logger(__name__)

RENEWAL_RISK_SIGNAL_TYPES: frozenset[SignalType] = frozenset({
    SignalType.LEADERSHIP_CHANGE,
})

EXPANSION_SIGNAL_TYPES: frozenset[SignalType] = frozenset({
    SignalType.FUNDING_ROUND,
    SignalType.HIRING,
    SignalType.FRANCHISE_EXPANSION,
    SignalType.EXPANSION,
    SignalType.PRODUCT_LAUNCH,
    SignalType.FUNDING_GRANT,
})


class RevenueContinuityService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.opportunities = OpportunityRepository(session)

    def classify(
        self,
        *,
        company_id: uuid.UUID | None,
        signal_type: SignalType,
        organization_id: uuid.UUID | None = None,
    ) -> str:
        """Return the ``opportunity_type`` (see app.models.base) this
        signal should materialize as. Never raises — any failure here must
        fall back to ``NEW_LOGO``, the behavior every opportunity had
        before this service existed, never block opportunity creation.
        """
        try:
            return self._classify(company_id, signal_type, organization_id)
        except Exception:  # noqa: BLE001
            logger.exception(
                "RevenueContinuityService.classify failed — defaulting to new_logo"
            )
            return NEW_LOGO

    def _classify(
        self,
        company_id: uuid.UUID | None,
        signal_type: SignalType,
        organization_id: uuid.UUID | None,
    ) -> str:
        if company_id is None:
            return NEW_LOGO

        is_existing_customer = self.opportunities.has_won_opportunity(
            company_id, organization_id=organization_id
        )
        if not is_existing_customer:
            return NEW_LOGO

        if signal_type in RENEWAL_RISK_SIGNAL_TYPES:
            return RENEWAL_RISK
        if signal_type in EXPANSION_SIGNAL_TYPES:
            return EXPANSION
        return NEW_LOGO
