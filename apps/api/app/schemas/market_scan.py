"""Schema for the market-scan cron tick endpoint — see
``app.api.v1.endpoints.internal_market_scan``.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class MarketScanTickOut(BaseModel):
    """What one Vercel Cron invocation did.

    ``enabled=False`` (with every count at 0) is the expected response for
    every tick until ``MARKET_SCAN_ENABLED`` is deliberately turned on —
    that's a successful no-op, not an error.
    """

    enabled: bool
    companies_scanned: int
    signals_created: int
    duration_ms: int
    errors: list[dict[str, Any]]
