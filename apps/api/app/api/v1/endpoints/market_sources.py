"""``GET /market-sources`` — which senses the proactive market scan has.

Integrations shows this as "Fuentes de mercado": the keyless sources
(GDELT press, Greenhouse/Lever hiring) are always live, Google news
lights up once its key is configured. Read-only and organization-
agnostic — provider configuration is deployment-wide (env vars), so
there is nothing tenant-specific to scope here beyond requiring a
logged-in user, same as ``GET /integrations``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models.user import User
from app.schemas.market_sources import MarketSourceOut, MarketSourcesOut
from app.services.external_api.orchestrator import ExternalAPIOrchestrator

router = APIRouter(prefix="/market-sources", tags=["Market Sources"])


@router.get("", response_model=MarketSourcesOut, summary="Status of every market-scan source")
def list_market_sources(_: User = Depends(get_current_user)) -> MarketSourcesOut:
    settings = get_settings()
    sources = [MarketSourceOut(**s) for s in ExternalAPIOrchestrator().list_market_sources()]
    return MarketSourcesOut(
        scan_enabled=settings.MARKET_SCAN_ENABLED,
        interval_hours=settings.MARKET_SCAN_INTERVAL_HOURS,
        sources=sources,
    )
