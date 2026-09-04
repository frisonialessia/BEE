"""DarkFunnelService — external intent signal processing and hot lead scoring.

The dark funnel aggregates buying signals that happen outside the vendor's
direct visibility: anonymous website visits, G2 reviews, competitor research,
etc. These are leading indicators — companies showing intent before they
fill out any form.

This service:
1. Ingests ``DarkFunnelSignal`` records (from webhooks, pixel tracking, etc.)
2. Aggregates signals per company_domain in a 30-day sliding window
3. Computes a ``research_intensity_score`` (0-100) using signal weights
4. Classifies companies into buying stages: awareness → consideration →
   decision → ready_to_buy
5. Flags companies as ``is_hot=True`` when score > threshold (default 50)

Dashboard integration
---------------------
``GET /api/v1/dark-funnel/hot-leads`` replaces the BehavioralCollector as
the primary Hot Leads engine in the dashboard. Hot leads are surfaced with:
- research_intensity_score
- buying_stage badge
- Top intent keywords
- Signal history

How score is computed
---------------------
::

    score = min(100, Σ(signal.weight * recency_factor))

Where ``recency_factor = 1.0 - (days_ago / 30)`` so recent signals are
worth more than old ones in the 30-day window.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.dark_funnel import (
    SIGNAL_WEIGHTS,
    BuyingStage,
    DarkFunnelSignal,
    HotLeadScore,
)
from app.schemas.dark_funnel import (
    DarkFunnelSignalIn,
    DarkFunnelSignalOut,
    DarkFunnelSummary,
    HotLeadOut,
)
from app.services.permissions import scope_by_organization_id as _scope

logger = get_logger(__name__)

_HOT_THRESHOLD = 50.0    # Score above this → is_hot = True
_WINDOW_DAYS = 30         # Rolling window for signal aggregation


class DarkFunnelService:
    """Processes and aggregates dark funnel intent signals to surface hot leads."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Signal ingestion ──────────────────────────────────────────────────────

    def ingest_signal(
        self, data: DarkFunnelSignalIn, organization_id: uuid.UUID | None = None
    ) -> DarkFunnelSignalOut:
        """Ingest a single intent signal and update the company's hot lead score.

        This is the primary ingestion point. After persisting the signal,
        it immediately recomputes the ``HotLeadScore`` for the company.

        Args:
            data: The incoming signal payload.
            organization_id: Tenant to stamp on the signal and its recomputed
                score, and to scope the dedup lookup — from the caller's JWT
                (dashboard "Simulate Signal") or org API key (webhook/pixel).

        Returns:
            A :class:`DarkFunnelSignalOut` representing the persisted signal.

        Idempotency: when ``data.external_id`` is set, a prior signal with the
        same id (scoped to this organization) is returned as-is instead of
        being re-ingested — a retried/replayed webhook delivery (network
        blip on the provider's side, or a captured-request replay) must not
        double-count into ``research_intensity_score`` and re-flip
        ``is_hot``/re-trigger hot-lead alerts. Sources with no natural event
        id (pixel tracking, manual entry) leave ``external_id`` unset and are
        never deduped — same tradeoff as ``SignalEngine.ingest``.
        """
        if data.external_id:
            existing_stmt = _scope(
                select(DarkFunnelSignal).where(DarkFunnelSignal.external_id == data.external_id),
                DarkFunnelSignal.organization_id,
                organization_id,
            )
            existing = self.session.exec(existing_stmt).first()
            if existing is not None:
                logger.info(
                    "DarkFunnelSignal deduplicated: external_id=%s domain=%s",
                    data.external_id, existing.company_domain,
                )
                return DarkFunnelSignalOut.model_validate(existing)

        weight = SIGNAL_WEIGHTS.get(data.signal_type, 5.0)

        signal = DarkFunnelSignal(
            organization_id=organization_id,
            company_domain=data.company_domain.lower().strip(),
            company_name=data.company_name,
            lead_id=data.lead_id,
            signal_type=data.signal_type,
            source_platform=data.source_platform,
            content_url=data.content_url,
            intent_keywords=data.intent_keywords,
            anonymous=data.anonymous,
            contact_role=data.contact_role,
            weight=weight,
            raw_payload=data.raw_payload,
            external_id=data.external_id,
            processed=False,
        )
        self.session.add(signal)
        self.session.flush()

        # Recompute hot lead score for this company
        self._recompute_score(
            data.company_domain.lower().strip(), data.company_name, data.lead_id, organization_id
        )

        signal.processed = True
        self.session.add(signal)
        self.session.flush()
        self.session.refresh(signal)

        logger.info(
            "DarkFunnelSignal ingested: domain=%s type=%s weight=%.1f",
            signal.company_domain, signal.signal_type, signal.weight,
        )
        return DarkFunnelSignalOut.model_validate(signal)

    def ingest_batch(
        self, signals: list[DarkFunnelSignalIn], organization_id: uuid.UUID | None = None
    ) -> list[DarkFunnelSignalOut]:
        """Ingest multiple signals in one transaction."""
        results = []
        domains_affected: set[str] = set()

        for data in signals:
            weight = SIGNAL_WEIGHTS.get(data.signal_type, 5.0)
            signal = DarkFunnelSignal(
                organization_id=organization_id,
                company_domain=data.company_domain.lower().strip(),
                company_name=data.company_name,
                lead_id=data.lead_id,
                signal_type=data.signal_type,
                source_platform=data.source_platform,
                content_url=data.content_url,
                intent_keywords=data.intent_keywords,
                anonymous=data.anonymous,
                contact_role=data.contact_role,
                weight=weight,
                raw_payload=data.raw_payload,
            )
            self.session.add(signal)
            domains_affected.add(data.company_domain.lower().strip())
            results.append(signal)

        self.session.flush()

        for domain in domains_affected:
            relevant = next((s for s in results if s.company_domain == domain), None)
            self._recompute_score(
                domain,
                relevant.company_name if relevant else None,
                relevant.lead_id if relevant else None,
                organization_id,
            )

        for signal in results:
            signal.processed = True
            self.session.add(signal)

        self.session.flush()
        return [DarkFunnelSignalOut.model_validate(s) for s in results]

    # ── Hot lead queries ──────────────────────────────────────────────────────

    def get_hot_leads(
        self,
        min_score: float = 0.0,
        buying_stage: str | None = None,
        limit: int = 50,
        hot_only: bool = False,
        organization_id: uuid.UUID | None = None,
    ) -> list[HotLeadOut]:
        """Return the hot lead list, sorted by research_intensity_score descending."""
        stmt = (
            select(HotLeadScore)
            .order_by(HotLeadScore.research_intensity_score.desc())
            .limit(limit)
        )
        if min_score > 0:
            stmt = stmt.where(HotLeadScore.research_intensity_score >= min_score)
        if buying_stage:
            stmt = stmt.where(HotLeadScore.buying_stage == buying_stage)
        if hot_only:
            stmt = stmt.where(HotLeadScore.is_hot)
        stmt = _scope(stmt, HotLeadScore.organization_id, organization_id)

        scores = list(self.session.exec(stmt).all())
        return [HotLeadOut.model_validate(s) for s in scores]

    def set_manual_temperature(
        self,
        score_id: uuid.UUID,
        manual_temperature: float | None,
        organization_id: uuid.UUID | None = None,
    ) -> HotLeadOut | None:
        """A person's override of one account's temperature, from the hive.

        Scoped to the caller's organization like every read here: a row of
        another tenant is simply "not found". Only the override changes —
        the computed score, stage and hot flag stay what the signals say, so
        clearing the override (``None``) restores BEE's own reading.
        """
        stmt = select(HotLeadScore).where(HotLeadScore.id == score_id)
        stmt = _scope(stmt, HotLeadScore.organization_id, organization_id)
        score = self.session.exec(stmt).first()
        if score is None:
            return None
        score.manual_temperature = manual_temperature
        self.session.add(score)
        self.session.commit()
        self.session.refresh(score)
        return HotLeadOut.model_validate(score)

    def get_company_score(
        self, company_domain: str, organization_id: uuid.UUID | None = None
    ) -> HotLeadOut | None:
        stmt = select(HotLeadScore).where(HotLeadScore.company_domain == company_domain.lower().strip())
        stmt = _scope(stmt, HotLeadScore.organization_id, organization_id)
        score = self.session.exec(stmt).first()
        return HotLeadOut.model_validate(score) if score else None

    def get_signals_for_domain(
        self, company_domain: str, limit: int = 50, organization_id: uuid.UUID | None = None
    ) -> list[DarkFunnelSignalOut]:
        stmt = (
            select(DarkFunnelSignal)
            .where(DarkFunnelSignal.company_domain == company_domain.lower().strip())
            .order_by(DarkFunnelSignal.created_at.desc())
            .limit(limit)
        )
        stmt = _scope(stmt, DarkFunnelSignal.organization_id, organization_id)
        signals = list(self.session.exec(stmt).all())
        return [DarkFunnelSignalOut.model_validate(s) for s in signals]

    def get_summary(self, organization_id: uuid.UUID | None = None) -> DarkFunnelSummary:
        """Return aggregate statistics for the dark funnel dashboard."""
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        all_scores = list(
            self.session.exec(_scope(select(HotLeadScore), HotLeadScore.organization_id, organization_id)).all()
        )

        today_stmt = _scope(
            select(DarkFunnelSignal).where(DarkFunnelSignal.created_at >= today_start),
            DarkFunnelSignal.organization_id,
            organization_id,
        )
        total_signals_today = len(list(self.session.exec(today_stmt).all()))

        all_signals_stmt = _scope(select(DarkFunnelSignal), DarkFunnelSignal.organization_id, organization_id)
        all_signals = list(self.session.exec(all_signals_stmt).all())
        signal_type_counts: dict[str, int] = {}
        for sig in all_signals:
            signal_type_counts[sig.signal_type] = signal_type_counts.get(sig.signal_type, 0) + 1
        top_signals = sorted(signal_type_counts.keys(), key=lambda k: signal_type_counts[k], reverse=True)[:5]

        return DarkFunnelSummary(
            total_signals_today=total_signals_today,
            total_hot_leads=sum(1 for s in all_scores if s.is_hot),
            ready_to_buy_count=sum(1 for s in all_scores if s.buying_stage == BuyingStage.READY_TO_BUY),
            decision_stage_count=sum(1 for s in all_scores if s.buying_stage == BuyingStage.DECISION),
            consideration_stage_count=sum(1 for s in all_scores if s.buying_stage == BuyingStage.CONSIDERATION),
            new_signals_today=total_signals_today,
            top_intent_signals=top_signals,
        )

    # ── Internal score computation ────────────────────────────────────────────

    def _recompute_score(
        self,
        domain: str,
        company_name: str | None,
        lead_id: uuid.UUID | None,
        organization_id: uuid.UUID | None = None,
    ) -> HotLeadScore:
        """Recompute the HotLeadScore for a company domain using the 30-day window.

        Scoped to ``organization_id`` — two organizations independently
        tracking intent signals for the same domain get independent scores,
        never a blended one (``DarkFunnelSignal.company_domain`` has no
        cross-org uniqueness constraint, so both organizations' signal rows
        for the same domain legitimately coexist).
        """
        window_start = datetime.now(UTC) - timedelta(days=_WINDOW_DAYS)

        # Fetch all signals in the window
        signals_stmt = select(DarkFunnelSignal).where(
            DarkFunnelSignal.company_domain == domain,
            DarkFunnelSignal.created_at >= window_start,
        )
        signals_stmt = _scope(signals_stmt, DarkFunnelSignal.organization_id, organization_id)
        signals = list(self.session.exec(signals_stmt).all())

        # Compute weighted score with recency factor
        now = datetime.now(UTC)
        total_score = 0.0
        signal_types: set[str] = set()
        all_keywords: list[str] = []
        last_signal_at: datetime | None = None

        for sig in signals:
            created = sig.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            days_ago = (now - created).total_seconds() / 86400
            recency = max(0.1, 1.0 - (days_ago / _WINDOW_DAYS))
            total_score += sig.weight * recency
            signal_types.add(sig.signal_type)
            all_keywords.extend(sig.intent_keywords or [])
            if last_signal_at is None or created > last_signal_at:
                last_signal_at = created

        total_score = min(100.0, total_score)
        is_hot = total_score >= _HOT_THRESHOLD

        # Top keywords (by frequency)
        kw_counts: dict[str, int] = {}
        for kw in all_keywords:
            kw_counts[kw] = kw_counts.get(kw, 0) + 1
        top_keywords = sorted(kw_counts.keys(), key=lambda k: kw_counts[k], reverse=True)[:10]

        # Get or create the HotLeadScore record
        existing_stmt = select(HotLeadScore).where(HotLeadScore.company_domain == domain)
        existing_stmt = _scope(existing_stmt, HotLeadScore.organization_id, organization_id)
        existing = self.session.exec(existing_stmt).first()

        if existing:
            existing.research_intensity_score = round(total_score, 1)
            existing.signal_count = len(signals)
            existing.signal_types_seen = list(signal_types)
            existing.top_intent_keywords = top_keywords
            existing.last_signal_at = last_signal_at
            existing.window_start_at = window_start
            existing.buying_stage = existing.score_to_stage()
            if is_hot and not existing.is_hot:
                existing.hot_since = datetime.now(UTC)
            existing.is_hot = is_hot
            if company_name and not existing.company_name:
                existing.company_name = company_name
            if lead_id and not existing.lead_id:
                existing.lead_id = lead_id
            self.session.add(existing)
            self.session.flush()
            return existing

        score_record = HotLeadScore(
            organization_id=organization_id,
            company_domain=domain,
            company_name=company_name,
            lead_id=lead_id,
            research_intensity_score=round(total_score, 1),
            signal_count=len(signals),
            signal_types_seen=list(signal_types),
            top_intent_keywords=top_keywords,
            last_signal_at=last_signal_at,
            window_start_at=window_start,
            is_hot=is_hot,
            hot_since=datetime.now(UTC) if is_hot else None,
        )
        score_record.buying_stage = score_record.score_to_stage()
        self.session.add(score_record)
        self.session.flush()
        self.session.refresh(score_record)

        logger.info(
            "HotLeadScore updated: domain=%s score=%.1f stage=%s hot=%s",
            domain, total_score, score_record.buying_stage, is_hot,
        )
        return score_record
