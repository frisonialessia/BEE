"""BI data feed — GET /api/v1/bi/{companies,leads,opportunities}.

Power BI (and Tableau, Looker Studio, or a spreadsheet's own "from web"
import) don't speak OAuth the way a CRM does — the standard way a BI tool
gets at a SaaS's data is "paste in a URL, optionally a key". This gives
that URL a real target: three flat, paginated, read-only feeds over BEE's
own core entities, authenticated the same way a webhook is (an
organization API key — see ``app.services.organizations`` /
``POST /organizations/api-keys``), not a JWT session a scheduled Power BI
refresh could never carry.

Why three separate feeds instead of one flattened export
----------------------------------------------------------
Power BI's own data model builds relationships between tables it's given
(``Opportunity.company_id`` -> ``Company.id``) far better than it can
un-flatten a single wide export back into a star schema — so this returns
the same normalized shape the dashboard itself already uses
(``CompanyOut``/``LeadOut``/``OpportunityOut``, unchanged) rather than a
bespoke BI-only representation that would drift from the real API the
moment either one changes.

Auth: org API key only, never a bare "untagged" fallback
-----------------------------------------------------------
Every other read-only list endpoint in this codebase (``GET /companies``,
``GET /leads``, ...) treats an unauthenticated caller as
backward-compatible — it still gets *something* (untagged/shared data),
just not any one organization's. That default is wrong here: a feed URL
handed to Power BI is the caller's only credential (there is no JWT
session behind a scheduled cloud refresh), so this uses
``require_organization_from_webhook_key`` instead of the usual
``get_organization_id`` — a missing/invalid key 401s outright rather than
quietly falling back to the shared pool. The key is accepted as either
the ``X-BEE-Org-Key`` header or an ``?org_key=`` query parameter, so the
URL alone (Power BI's "Web" connector needs no custom-headers setup) is
enough: ``GET /api/v1/bi/opportunities?org_key=<key>``.

If ``API_SECRET_KEY`` is configured for this deployment (see
``app.core.middleware.APIKeyMiddleware``), every endpoint including these
also requires the deployment-wide ``X-API-Key`` header first — same as
every other integration (n8n, Zapier) already needs, not something new
this module introduces.

One-way, read-only, capped page size — BEE never receives anything back
from a BI tool, and a feed with no upper bound on ``limit`` would let one
export request try to pull an entire organization's history in a single
response.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.deps import require_organization_from_webhook_key
from app.core.database import get_session
from app.repositories.company import CompanyRepository
from app.repositories.lead import LeadRepository
from app.repositories.opportunity import OpportunityRepository
from app.schemas.company import CompanyOut
from app.schemas.lead import LeadOut
from app.schemas.signal import OpportunityOut

router = APIRouter(prefix="/bi", tags=["BI Data Feed"])

_MAX_PAGE_SIZE = 500
_DEFAULT_PAGE_SIZE = 200


@router.get(
    "/companies",
    response_model=list[CompanyOut],
    summary="Power BI / BI-tool feed — companies (paginated, org API key required)",
)
def bi_companies(
    limit: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_from_webhook_key),
) -> list[CompanyOut]:
    """Page through this organization's companies, most recently created
    first — same ordering and shape as ``GET /companies``, just scoped
    strictly to the caller's own org (see module docstring)."""
    repo = CompanyRepository(session)
    companies = repo.list_scoped(limit=limit, offset=offset, organization_id=organization_id)
    return [CompanyOut.model_validate(c) for c in companies]


@router.get(
    "/leads",
    response_model=list[LeadOut],
    summary="Power BI / BI-tool feed — leads (paginated, org API key required)",
)
def bi_leads(
    limit: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_from_webhook_key),
) -> list[LeadOut]:
    repo = LeadRepository(session)
    leads = repo.list_scoped(limit=limit, offset=offset, organization_id=organization_id)
    return [LeadOut.model_validate(lead) for lead in leads]


@router.get(
    "/opportunities",
    response_model=list[OpportunityOut],
    summary="Power BI / BI-tool feed — opportunities (paginated, org API key required)",
)
def bi_opportunities(
    limit: int = Query(default=_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_from_webhook_key),
) -> list[OpportunityOut]:
    """``status`` isn't filterable here on purpose — a BI report almost
    always wants the full pipeline (open + won + lost) to compute win rate
    and stage-conversion itself, the same reason ``GET /opportunities``
    defaults to every status too."""
    repo = OpportunityRepository(session)
    opportunities = repo.list_scoped(limit=limit, offset=offset, organization_id=organization_id)
    return [OpportunityOut.model_validate(o) for o in opportunities]
