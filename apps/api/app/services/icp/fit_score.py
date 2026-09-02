"""ICP fit-score computation — the server-side port of the frontend's own
``lib/icp.ts`` (``computeFitScore``/``isIcpConfigured``), which used to be
the *only* place this was ever computed. Keep this in lock-step with that
file if either changes — same algorithm, same semantics, on purpose (a
company's fit shouldn't depend on which side of the API computed it).

Fit is 0-100: the fraction of the ICP dimensions the organization actually
configured that this account matches. A dimension left empty in
``Organization.icp_criteria`` counts neither for nor against — "I don't
care about country" shouldn't penalize anyone. Returns ``None`` when the
ICP isn't configured at all (every dimension empty): never fabricate a fit
score against an undefined target.

Two levels, same as the frontend: firmographics against the Company
itself (industry/size/country/revenue_range), and actual buyer persona
within that account (job title/seniority against its Leads, tech stack
against its ``tech_adoption`` Signals) — fitting the right *account*
isn't enough if nobody with buying authority ever shows up in it.
"""

from __future__ import annotations

from app.models.company import Company
from app.models.lead import Lead
from app.models.signal import Signal

# The 7 dimensions Organization.icp_criteria may carry, as a raw JSON dict
# (see that model's own comment on why it's untyped) — mirrors the
# frontend's IcpCriteria interface (apps/web/src/lib/api/organizations.ts)
# field for field.
_CRITERIA_KEYS = (
    "industries",
    "sizes",
    "countries",
    "revenue_ranges",
    "job_titles",
    "seniorities",
    "tech_keywords",
)


def is_icp_configured(criteria: dict) -> bool:
    """True once at least one dimension has been set — an all-empty
    criteria dict is "never configured", not "matches everything"."""
    return any(criteria.get(key) for key in _CRITERIA_KEYS)


def _includes_ci(haystack: str, needle: str) -> bool:
    return needle.lower() in haystack.lower()


def compute_fit_score(
    company: Company,
    criteria: dict,
    *,
    company_leads: list[Lead],
    company_tech_signals: list[Signal],
) -> float | None:
    """`company_leads`/`company_tech_signals` are the caller's
    responsibility to pre-filter to this company (and, for signals, to
    ``signal_type == "tech_adoption"``) — this function does no querying
    of its own, so it stays trivially testable without a DB."""
    if not is_icp_configured(criteria):
        return None

    dimensions = 0
    matches = 0

    industries = criteria.get("industries") or []
    if industries:
        dimensions += 1
        if company.industry and company.industry in industries:
            matches += 1

    sizes = criteria.get("sizes") or []
    if sizes:
        dimensions += 1
        if company.size and company.size in sizes:
            matches += 1

    countries = criteria.get("countries") or []
    if countries:
        dimensions += 1
        if company.country and company.country in countries:
            matches += 1

    revenue_ranges = criteria.get("revenue_ranges") or []
    if revenue_ranges:
        dimensions += 1
        if company.revenue_range and company.revenue_range in revenue_ranges:
            matches += 1

    job_titles = criteria.get("job_titles") or []
    if job_titles:
        dimensions += 1
        hit = any(
            lead.title and any(_includes_ci(lead.title, target) for target in job_titles)
            for lead in company_leads
        )
        if hit:
            matches += 1

    seniorities = criteria.get("seniorities") or []
    if seniorities:
        dimensions += 1
        hit = any(lead.seniority and lead.seniority in seniorities for lead in company_leads)
        if hit:
            matches += 1

    tech_keywords = criteria.get("tech_keywords") or []
    if tech_keywords:
        dimensions += 1
        hit = any(
            any(
                _includes_ci(signal.title, target)
                or (signal.description and _includes_ci(signal.description, target))
                for target in tech_keywords
            )
            for signal in company_tech_signals
        )
        if hit:
            matches += 1

    if dimensions == 0:
        return None
    return round((matches / dimensions) * 100)
