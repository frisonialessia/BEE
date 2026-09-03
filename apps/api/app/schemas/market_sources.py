"""Schemas for ``GET /market-sources``."""

from __future__ import annotations

from pydantic import BaseModel


class MarketSourceOut(BaseModel):
    name: str
    configured: bool
    requires_credentials: bool
    rate_limit_per_hour: int


class MarketSourcesOut(BaseModel):
    scan_enabled: bool
    interval_hours: int
    sources: list[MarketSourceOut]
