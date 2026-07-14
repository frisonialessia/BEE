"""TrendAnalyst — environmental market intelligence.

Where the SignalEngine processes individual signals (micro view), the
TrendAnalyst processes *aggregations* of signals over time (macro view). It
answers: "What is the market telling us collectively right now?"

Detected patterns are stored as ``MarketInsight`` records and injected into
the ``EnrichmentContext`` before strategy generation, giving generators
sector-wide context to sharpen their battlecards.

Example insights
----------------
- "B2B SaaS funding events up 40% this week — capitalize on budget availability."
- "Healthcare is showing an unusual hiring surge — 7 signals in 3 days, sector in motion."
- "Tech-adoption signals have spiked for Snowflake migrations — strong ecosystem play."

Design
------
The TrendAnalyst is intentionally stateless between runs — it always reads from
the database and writes new MarketInsight records. Scheduling can be wired via
a cron endpoint, a background task, or a call from the signal engine after a
configurable number of ingestions.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, func, select

from app.core.logging import get_logger
from app.models.base import InsightType
from app.models.market_insight import MarketInsight
from app.models.signal import Signal
from app.repositories.market_insight import MarketInsightRepository
from app.schemas.insights import MarketInsightRef, TrendAnalysisResult

logger = get_logger(__name__)

_SPIKE_MULTIPLIER = 1.5   # current period must be >1.5x prior to be a spike
_MIN_EVIDENCE = 3          # minimum signals to call a pattern


class TrendAnalyst:
    """Analyzes aggregate signal data to detect market patterns.

    Inject via the ``/insights/analyze`` endpoint or call programmatically
    from a background scheduler.
    """

    def __init__(self, session: Session) -> None:
        self.session = session
        self._insights = MarketInsightRepository(session)

    def analyze(self, window_days: int = 7) -> TrendAnalysisResult:
        """Run a full trend analysis cycle.

        1. Expire stale insights from the previous cycle.
        2. Count signals by type and industry for the current window.
        3. Compare to the prior window to detect volume spikes.
        4. Create new MarketInsight records for detected patterns.
        """
        expired = self._insights.expire_stale()
        now = datetime.now(UTC)
        current_start = now - timedelta(days=window_days)
        prior_start = now - timedelta(days=window_days * 2)

        # Fetch aggregate counts for both windows.
        current_by_type = self._count_by_type(current_start, now)
        prior_by_type = self._count_by_type(prior_start, current_start)
        current_by_industry = self._count_by_industry(current_start, now)

        created = 0

        # ── Volume spike detection ────────────────────────────────────────────
        for sig_type, current_count in current_by_type.items():
            prior_count = prior_by_type.get(sig_type, 0)
            if current_count < _MIN_EVIDENCE:
                continue
            if prior_count == 0 or current_count / prior_count >= _SPIKE_MULTIPLIER:
                pct = (
                    f"{((current_count / prior_count) - 1) * 100:.0f}% "
                    if prior_count > 0
                    else ""
                )
                insight = self._build_volume_spike_insight(
                    sig_type=sig_type,
                    current_count=current_count,
                    prior_count=prior_count,
                    pct_label=pct,
                    window_days=window_days,
                    expires_at=now + timedelta(days=window_days),
                )
                self._insights.add(insight)
                created += 1

        # ── Sector momentum detection ─────────────────────────────────────────
        for industry, count in current_by_industry.items():
            if count >= _MIN_EVIDENCE:
                insight = self._build_sector_momentum_insight(
                    industry=industry,
                    count=count,
                    window_days=window_days,
                    expires_at=now + timedelta(days=window_days),
                )
                self._insights.add(insight)
                created += 1

        self.session.commit()
        logger.info(
            "TrendAnalyst: %d insights created, %d expired (window=%dd)",
            created, expired, window_days,
        )

        total_signals = sum(current_by_type.values())
        top_types = sorted(
            [{"signal_type": k, "count": v} for k, v in current_by_type.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:5]
        top_industries = sorted(
            [{"industry": k, "count": v} for k, v in current_by_industry.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:5]

        return TrendAnalysisResult(
            insights_created=created,
            insights_expired=expired,
            window_days=window_days,
            signals_analyzed=total_signals,
            top_signal_types=top_types,
            top_industries=top_industries,
        )

    def get_active_insights_for_context(
        self, signal_type: str, industry: str | None = None
    ) -> list[MarketInsightRef]:
        """Return fresh insights as lightweight refs for EnrichmentContext injection."""
        rows = self._insights.get_active_insights(signal_type=signal_type, industry=industry)
        return [
            MarketInsightRef(
                insight_type=row.insight_type.value,
                title=row.title,
                description=row.description,
                tactical_implication=row.tactical_implication,
                confidence=row.confidence,
            )
            for row in rows
            if row.is_fresh
        ]

    # ── Private builders ──────────────────────────────────────────────────────

    def _count_by_type(self, start: datetime, end: datetime) -> dict[str, int]:
        rows = self.session.exec(
            select(Signal.signal_type, func.count(Signal.id).label("n"))
            .where(Signal.detected_at >= start)
            .where(Signal.detected_at < end)
            .group_by(Signal.signal_type)
        ).all()
        return {str(r[0].value if hasattr(r[0], "value") else r[0]): int(r[1]) for r in rows}

    def _count_by_industry(self, start: datetime, end: datetime) -> dict[str, int]:
        from app.models.company import Company

        rows = self.session.exec(
            select(Company.industry, func.count(Signal.id).label("n"))
            .join(Signal, Signal.company_id == Company.id)
            .where(Signal.detected_at >= start)
            .where(Signal.detected_at < end)
            .where(Company.industry.is_not(None))  # type: ignore[attr-defined]
            .group_by(Company.industry)
        ).all()
        return {str(r[0]): int(r[1]) for r in rows if r[0]}

    def _build_volume_spike_insight(
        self,
        sig_type: str,
        current_count: int,
        prior_count: int,
        pct_label: str,
        window_days: int,
        expires_at: datetime,
    ) -> MarketInsight:
        if prior_count == 0:
            desc = (
                f"First {current_count} '{sig_type}' signals detected in the last "
                f"{window_days} days — a new pattern is emerging."
            )
            implication = f"Sector attention is shifting toward {sig_type} events. Increase outreach cadence."
        else:
            desc = (
                f"'{sig_type}' signals are up {pct_label}vs the prior {window_days}-day period "
                f"({current_count} vs {prior_count}). Sector momentum is high."
            )
            implication = (
                f"Urgency for {sig_type} opportunities is elevated. "
                "Move from 'this_week' to 'immediate' where possible."
            )

        return MarketInsight(
            insight_type=InsightType.VOLUME_SPIKE,
            signal_type=sig_type,
            title=f"{sig_type.replace('_', ' ').title()} signals spiking",
            description=desc,
            tactical_implication=implication,
            confidence=min(1.0, 0.5 + current_count * 0.05),
            evidence_count=current_count,
            evidence={"current": current_count, "prior": prior_count},
            ttl_hours=window_days * 24,
            expires_at=expires_at,
        )

    def _build_sector_momentum_insight(
        self,
        industry: str,
        count: int,
        window_days: int,
        expires_at: datetime,
    ) -> MarketInsight:
        return MarketInsight(
            insight_type=InsightType.SECTOR_MOMENTUM,
            industry=industry,
            title=f"{industry} sector in motion",
            description=(
                f"{count} signals detected in the {industry} sector over the last "
                f"{window_days} days — the sector is active."
            ),
            tactical_implication=(
                f"Companies in {industry} are experiencing change events. "
                "Outreach to this sector is well-timed."
            ),
            confidence=min(1.0, 0.4 + count * 0.06),
            evidence_count=count,
            evidence={"industry": industry, "count": count},
            ttl_hours=window_days * 24,
            expires_at=expires_at,
        )
