"""Schema for GET /search — see app.services.brain_search.service."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field


class BrainSearchResultOut(BaseModel):
    """One match from BEE's cross-entity semantic search."""

    entity_type: Literal["signal", "company", "opportunity"]
    entity_id: uuid.UUID
    title: str
    snippet: str
    score: float = Field(description="0 (weak match) .. 1 (near-exact match)")
