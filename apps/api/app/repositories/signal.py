"""Signal repository."""

from __future__ import annotations

from sqlmodel import select

from app.models.signal import Signal
from app.repositories.base import BaseRepository


class SignalRepository(BaseRepository[Signal]):
    """Data-access operations for :class:`Signal`."""

    model = Signal

    def get_by_external_id(self, external_id: str) -> Signal | None:
        """Look up a signal by its provider external id (idempotent ingestion)."""
        statement = select(Signal).where(Signal.external_id == external_id)
        return self.session.exec(statement).first()
