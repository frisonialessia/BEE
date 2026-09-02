"""DB-aware wrapper around fit_score.compute_fit_score — fetches whatever
a company's org/leads/signals currently are, computes, and writes
Company.fit_score. Caller commits (same convention as the repository
merge() methods this pass already touched).

Both entry points are called from app/services/events/listeners.py, never
directly from an endpoint — see that module for which events trigger
which of these, and app/services/events/dispatcher.py for why events
exist instead of a direct call here.
"""

from __future__ import annotations

import logging
import uuid

from sqlmodel import Session, select

from app.models.company import Company
from app.models.lead import Lead
from app.models.organization import Organization
from app.models.signal import Signal
from app.services.icp.fit_score import compute_fit_score

logger = logging.getLogger(__name__)

# An org-wide ICP-criteria change recomputes every one of that org's
# companies synchronously, in the same request — fine at the scale a
# single organization's account list actually reaches, but not something
# to let run unbounded. Past this many companies, recompute the most
# recently active ones and log that the rest were skipped rather than
# hang the request; a proper background job (JobQueueService) is the
# right upgrade if this limit ever actually bites in practice.
_MAX_ORG_RECOMPUTE = 500


def recompute_company_fit_score(session: Session, company_id: uuid.UUID) -> None:
    """Recompute and persist `fit_score` for one company. No-op (leaves
    fit_score as it was) if the company or its organization can't be
    found — the row may have been deleted by the time a listener runs."""
    company = session.get(Company, company_id)
    if company is None:
        return
    if company.organization_id is None:
        # No org context (e.g. legacy untagged rows) — icp_criteria lives
        # on Organization, so there's nothing to score against.
        return
    org = session.get(Organization, company.organization_id)
    if org is None:
        return

    leads = list(session.exec(select(Lead).where(Lead.company_id == company_id)).all())
    tech_signals = list(
        session.exec(
            select(Signal).where(Signal.company_id == company_id, Signal.signal_type == "tech_adoption")
        ).all()
    )

    company.fit_score = compute_fit_score(
        company, org.icp_criteria or {}, company_leads=leads, company_tech_signals=tech_signals
    )
    session.add(company)


def recompute_org_fit_scores(session: Session, organization_id: uuid.UUID) -> None:
    """Recompute every company in an organization — used when the ICP
    criteria themselves change, since that can shift every account's fit
    at once, not just one company's."""
    company_ids = list(
        session.exec(
            select(Company.id)
            .where(Company.organization_id == organization_id)
            .order_by(Company.updated_at.desc())
            .limit(_MAX_ORG_RECOMPUTE)
        ).all()
    )
    if len(company_ids) == _MAX_ORG_RECOMPUTE:
        logger.warning(
            "recompute_org_fit_scores: organization %s has more than %d companies — "
            "only the %d most recently updated were recomputed.",
            organization_id,
            _MAX_ORG_RECOMPUTE,
            _MAX_ORG_RECOMPUTE,
        )
    for company_id in company_ids:
        recompute_company_fit_score(session, company_id)
