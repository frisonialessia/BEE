"""NetworkNavigator API endpoints — warm intro path finding."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_organization_id, require_organization_id
from app.core.database import get_session
from app.schemas.network import (
    NetworkConnectionCreate,
    NetworkConnectionOut,
    NetworkQueryResult,
    NetworkStats,
    WarmIntroSummary,
)
from app.services.dark_funnel import DarkFunnelService
from app.services.network_navigator import NetworkNavigator

router = APIRouter(prefix="/network", tags=["Network Navigator (Warm Intros)"])

# How many of the org's hottest accounts a dashboard summary checks —
# each one costs a real find_intro_paths lookup, so this stays small
# rather than fanning out over every hot account ever scored.
_WARM_INTRO_HOT_ACCOUNT_CAP = 10


def _get_navigator(session: Session = Depends(get_session)) -> NetworkNavigator:
    return NetworkNavigator(session)


@router.post(
    "/connections",
    response_model=NetworkConnectionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a connection to the CEO's network",
)
def add_connection(
    data: NetworkConnectionCreate,
    nav: NetworkNavigator = Depends(_get_navigator),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_id),
) -> NetworkConnectionOut:
    """Add a professional contact to the CEO's network.

    Network connections power the warm intro path finder. The more accurate
    and complete the network is, the better the intro path recommendations.

    Relationship strength guide (1-10):
    * 9-10: Close friend, co-founder, long-term business partner
    * 7-8: Strong relationship, regular contact
    * 5-6: Good acquaintance, occasional contact
    * 3-4: Weak tie, met at conference, little real interaction
    * 1-2: LinkedIn connection only

    For 2nd-degree path finding, set ``mutual_connection_ids`` to the UUIDs
    of connections who know this person (linking the graph).
    """
    conn = nav.add_connection(data, organization_id)
    session.commit()
    session.refresh(conn)
    return NetworkConnectionOut.model_validate(conn)


@router.get(
    "/connections",
    response_model=list[NetworkConnectionOut],
    summary="List all network connections",
)
def list_connections(
    connection_type: str | None = Query(default=None),
    min_strength: int = Query(default=1, ge=1, le=10),
    limit: int = Query(default=100, le=500),
    nav: NetworkNavigator = Depends(_get_navigator),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> list[NetworkConnectionOut]:
    conns = nav.list_connections(
        connection_type=connection_type, min_strength=min_strength, limit=limit, organization_id=organization_id
    )
    return [NetworkConnectionOut.model_validate(c) for c in conns]


@router.delete(
    "/connections/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate a network connection",
)
def delete_connection(
    connection_id: uuid.UUID,
    nav: NetworkNavigator = Depends(_get_navigator),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID = Depends(require_organization_id),
) -> None:
    ok = nav.delete_connection(connection_id, organization_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    session.commit()


@router.get(
    "/paths",
    response_model=NetworkQueryResult,
    summary="Find warm introduction paths to a target company",
)
def find_intro_paths(
    target_domain: str = Query(description="Email domain of the target company (e.g. techcorp.com)"),
    target_company: str | None = Query(default=None),
    target_name: str | None = Query(default=None, description="Name of the specific person to reach"),
    top_k: int = Query(default=5, ge=1, le=20),
    nav: NetworkNavigator = Depends(_get_navigator),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> NetworkQueryResult:
    """Find the strongest warm introduction paths from the CEO to a target company.

    Returns ranked introduction paths with:
    * **path_length**: 1 = direct connection, 2 = one connector needed
    * **intro_type**: warm_intro | referral | alumni | cold
    * **strength_score**: composite relationship strength (0-10)
    * **connector_name**: who to ask for the introduction
    * **draft_ask**: ready-to-send intro request message

    The CEO can use the ``draft_ask`` to request an introduction from the
    connector, dramatically increasing response rates vs. cold outreach.
    """
    return nav.find_intro_paths(
        target_domain=target_domain,
        target_company=target_company,
        target_name=target_name,
        top_k=top_k,
        organization_id=organization_id,
    )


@router.get(
    "/warm-intros/summary",
    response_model=WarmIntroSummary,
    summary="How many of the org's current hot accounts have a warm path in",
)
def get_warm_intro_summary(
    session: Session = Depends(get_session),
    nav: NetworkNavigator = Depends(_get_navigator),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> WarmIntroSummary:
    """Dashboard-wide aggregate for Resumen's "Introducciones cálidas" card.

    ``find_intro_paths`` only ever answers for one target company; this
    checks the org's hottest ``_WARM_INTRO_HOT_ACCOUNT_CAP`` accounts (Dark
    Funnel's own ranking) one at a time and reports how many have a real
    path, with the strongest few as examples. Bounded on purpose — this is
    a handful of lookups per dashboard load, never one per hot account the
    organization has ever scored.
    """
    hot_leads = DarkFunnelService(session).get_hot_leads(
        hot_only=True, limit=_WARM_INTRO_HOT_ACCOUNT_CAP, organization_id=organization_id
    )
    hot_accounts = [(lead.company_domain, lead.company_name or lead.company_domain) for lead in hot_leads]
    return nav.summarize_hot_account_paths(hot_accounts, organization_id=organization_id)


@router.get(
    "/stats",
    response_model=NetworkStats,
    summary="Network coverage statistics",
)
def get_network_stats(
    nav: NetworkNavigator = Depends(_get_navigator),
    organization_id: uuid.UUID | None = Depends(get_organization_id),
) -> NetworkStats:
    """Return summary statistics about the CEO's professional network coverage."""
    return nav.get_stats(organization_id)
