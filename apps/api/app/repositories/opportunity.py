"""Opportunity repository."""

from __future__ import annotations

from app.models.opportunity import Opportunity
from app.repositories.base import BaseRepository


class OpportunityRepository(BaseRepository[Opportunity]):
    """Data-access operations for :class:`Opportunity`."""

    model = Opportunity
