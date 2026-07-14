"""MarketInsight repository."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import select

from app.models.market_insight import MarketInsight
from app.repositories.base import BaseRepository


class MarketInsightRepository(BaseRepository[MarketInsight]):
    model = MarketInsight

    def get_active_insights(
        self,
        signal_type: str | None = None,
        industry: str | None = None,
        limit: int = 5,
    ) -> list[MarketInsight]:
        """Return fresh active insights, optionally filtered by signal type / industry."""
        now = datetime.now(UTC)
        stmt = (
            select(MarketInsight)
            .where(MarketInsight.is_active.is_(True))  # type: ignore[attr-defined]
            .where(
                (MarketInsight.expires_at.is_(None)) | (MarketInsight.expires_at > now)  # type: ignore[attr-defined]
            )
            .order_by(MarketInsight.confidence.desc(), MarketInsight.created_at.desc())  # type: ignore[attr-defined]
            .limit(limit)
        )
        if signal_type:
            stmt = stmt.where(
                (MarketInsight.signal_type == signal_type) | MarketInsight.signal_type.is_(None)  # type: ignore[attr-defined]
            )
        if industry:
            stmt = stmt.where(
                (MarketInsight.industry == industry) | MarketInsight.industry.is_(None)  # type: ignore[attr-defined]
            )
        return list(self.session.exec(stmt).all())

    def expire_stale(self) -> int:
        """Mark insights past their TTL as inactive. Returns count expired."""
        now = datetime.now(UTC)
        stale = list(
            self.session.exec(
                select(MarketInsight)
                .where(MarketInsight.is_active.is_(True))  # type: ignore[attr-defined]
                .where(MarketInsight.expires_at <= now)  # type: ignore[attr-defined]
            ).all()
        )
        for insight in stale:
            insight.is_active = False
            self.session.add(insight)
        return len(stale)
