"""Aggregate router for API v1.

New endpoint modules are wired in here. Versioning the router (``/api/v1``) lets
the API evolve without breaking existing integrations.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import health, opportunities, signals

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(signals.router)
api_router.include_router(opportunities.router)
