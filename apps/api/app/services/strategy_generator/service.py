"""StrategyGeneratorService — the battlecard enrichment orchestrator.

This service is the boundary between the Signal Engine and the strategy
intelligence layer. The engine calls ``enrich(signal, opportunity)`` and
doesn't know — or care — how the strategy is produced.

Responsibilities
----------------
1. Query :class:`~app.services.feedback_loop.FeedbackLoopService` for
   historical success patterns (``success_hints``) and active A/B variants.
2. Query :class:`~app.services.trend_analyst.TrendAnalyst` for fresh macro
   market insights relevant to this signal type and industry.
3. Build an :class:`~app.services.strategy_generator.base.EnrichmentContext`
   injected with all three data sources.
4. Find the highest-priority generator that supports the context and run it.
5. Score the resulting strategy via :class:`~app.services.decision_confidence.DecisionConfidenceService`
   to set ``confidence_score`` and ``manual_review_required``.
6. Write the enriched strategy back to the ``Opportunity`` row.
7. Promote the opportunity to ``READY_TO_ACTION`` iff enrichment succeeded.

The adaptive learning loop
---------------------------
Steps 1-2 are where BEE gets smarter over time. As more deals close,
FeedbackLoopService hints improve. As more signals accumulate, TrendAnalyst
insights sharpen. Both inject themselves into every new strategy — no code
changes required.

Failure isolation: if every generator fails, the service logs the exception,
leaves the opportunity at ``DETECTED``, and returns ``False``.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

import app.services.strategy_generator.llm_generator  # noqa: F401  (registers LLM generator at priority=1000)
import app.services.strategy_generator.rule_based  # noqa: F401  (registers rule-based generator)
from app.core.logging import get_logger
from app.models.base import NEW_LOGO, OpportunityStatus, SignalType
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.schemas.strategy import StrategySchema
from app.services.decision_confidence import DecisionConfidenceService
from app.services.feedback_loop import FeedbackLoopService
from app.services.strategy_generator.base import EnrichmentContext
from app.services.strategy_generator.registry import get_strategy_generators

logger = get_logger(__name__)


class StrategyGeneratorService:
    """Orchestrates strategy generation with adaptive memory, market context, and decision-confidence scoring."""

    def __init__(
        self,
        session: Session,
        feedback_service: FeedbackLoopService | None = None,
        trend_analyst: object | None = None,
    ) -> None:
        self.session = session
        self._feedback = feedback_service or FeedbackLoopService(session)
        self._decision_confidence = DecisionConfidenceService()
        # Defaults to a real TrendAnalyst, same as _feedback above — this
        # class's own docstring documents both as auto-injecting into every
        # new strategy "no code changes required", but until now this
        # defaulted to bare None (no call site in the codebase ever passed
        # trend_analyst= explicitly), so ctx.market_insights was always empty
        # in production. Lazy import to avoid a circular dependency; pass an
        # explicit `object()` sentinel — not None — if trend injection ever
        # needs to be disabled on purpose (tests use a mock instead).
        if trend_analyst is not None:
            self._trend = trend_analyst
        else:
            from app.services.trend_analyst import TrendAnalyst

            self._trend = TrendAnalyst(session)

    def enrich(self, signal: Signal, opportunity: Opportunity) -> bool:
        """Generate and persist a battlecard strategy for the opportunity.

        Returns ``True`` when the opportunity is promoted to ``READY_TO_ACTION``,
        ``False`` when enrichment fails or produces an incomplete strategy.
        """
        ctx = self._build_context(signal, opportunity_type=opportunity.opportunity_type)
        strategy = self._run_generators(ctx, organization_id=signal.organization_id)
        if strategy is None:
            logger.warning("No strategy for opportunity %s; stays DETECTED.", opportunity.id)
            return False

        if not strategy.is_battlecard_complete():
            logger.warning(
                "Strategy for opportunity %s incomplete; stays DETECTED.", opportunity.id
            )
            return False

        # Apply decision-confidence scoring (sets confidence_score + manual_review_required).
        strategy = self._decision_confidence.score_and_flag(
            strategy,
            generator_name=strategy.generator,
            success_hints=ctx.success_hints,
            market_insights=ctx.market_insights,
            cautionary_patterns=ctx.cautionary_patterns,
        )

        opportunity.strategy = strategy.to_db_dict()
        opportunity.status = OpportunityStatus.READY_TO_ACTION
        self.session.add(opportunity)
        logger.info(
            "Opportunity %s → READY_TO_ACTION (generator=%s hints=%d insights=%d "
            "confidence=%.2f review_required=%s)",
            opportunity.id,
            strategy.generator,
            len(ctx.success_hints),
            len(ctx.market_insights),
            strategy.confidence_score,
            strategy.manual_review_required,
        )

        # Publish event to WorkflowOrchestrator (opt-in, non-blocking)
        self._publish_ready_event(opportunity, ctx)
        return True

    def _publish_ready_event(self, opportunity: Opportunity, ctx: EnrichmentContext) -> None:
        """Publish opportunity.ready_to_action to trigger workflow handlers."""
        try:
            from app.schemas.workflow import BeeEvent
            from app.services.workflow_orchestrator.service import WorkflowOrchestrator

            event = BeeEvent(
                event_type="opportunity.ready_to_action",
                entity_id=opportunity.id,
                entity_type="opportunity",
                payload={
                    "opportunity_id": str(opportunity.id),
                    "organization_id": str(opportunity.organization_id)
                    if opportunity.organization_id
                    else None,
                    "company_name": ctx.company_name,
                    "score": opportunity.score,
                    "signal_type": ctx.signal_type.value,
                },
            )
            WorkflowOrchestrator(self.session).publish(event)
        except Exception:  # noqa: BLE001
            logger.warning("WorkflowOrchestrator publish failed for ready_to_action event.")

    def _build_context(self, signal: Signal, *, opportunity_type: str = NEW_LOGO) -> EnrichmentContext:
        """Assemble an EnrichmentContext from all intelligence sources."""
        raw = signal.raw_payload or {}
        company_ref = raw.get("company") or {}
        lead_ref = raw.get("lead") or {}
        analysis = signal.analysis or {}

        signal_type = (
            signal.signal_type
            if isinstance(signal.signal_type, SignalType)
            else SignalType(signal.signal_type)
        )
        industry = company_ref.get("industry")

        # ── 1. Adaptive memory hints ──────────────────────────────────────────
        hints = self._feedback.get_success_hints(
            signal_type=signal_type.value, industry=industry, organization_id=signal.organization_id
        )

        # ── 2. A/B variant assignment ─────────────────────────────────────────
        variant_ref = self._feedback.get_active_variant(
            signal_type=signal_type.value, industry=industry, organization_id=signal.organization_id
        )

        # ── 3. Market insights from TrendAnalyst ──────────────────────────────
        market_insights = []
        if self._trend is not None:
            try:
                market_insights = self._trend.get_active_insights_for_context(
                    signal_type=signal_type.value,
                    industry=industry,
                    organization_id=signal.organization_id,
                )
            except Exception:  # noqa: BLE001
                logger.warning("TrendAnalyst unavailable; proceeding without market insights.")

        # ── 4. VectorKnowledgeBase: retrieve similar winning strategies ────────
        similar_wins = self._query_similar_wins(signal_type.value, industry, signal.title)

        # ── 4b. VectorKnowledgeBase: retrieve similar LOST deals (cautionary) ──
        # Separate query, separate result — never merged with similar_wins.
        cautionary_patterns = self._query_cautionary_patterns(
            signal_type.value, industry, signal.title
        )

        # ── 5. External enrichment (LinkedIn / G2 / Google) ───────────────────
        ext = raw.get("external_enrichment") or {}
        linkedin = ext.get("linkedin") or {}
        g2 = ext.get("g2") or {}
        google = ext.get("google_search") or {}
        intent_keywords: list[str] = []
        intent_keywords.extend(g2.get("intent_keywords") or [])
        intent_keywords.extend(google.get("intent_keywords") or [])

        # Prefer externally enriched lead fields when present
        enriched_lead = ext.get("lead") or lead_ref
        enriched_company = ext.get("company") or company_ref
        company_domain = enriched_company.get("domain")

        # ── 6. Psychographic profile (DISC style) ─────────────────────────────
        psychographic_style, psychographic_tone = self._query_psychographic(signal.lead_id)

        # ── 7. Dark funnel intent score ────────────────────────────────────────
        dark_funnel_score, dark_funnel_stage = self._query_dark_funnel(company_domain)

        # ── 8. Network intelligence: warm intro paths ─────────────────────────
        intro_paths = self._query_intro_paths(
            company_domain, enriched_company.get("name"), enriched_lead.get("full_name")
        )

        # ── 9. CEO brand voice (PersonalBrandService) ──────────────────────────
        brand_brief = self._query_brand_brief(signal)

        return EnrichmentContext(
            signal_type=signal_type,
            signal_title=signal.title,
            signal_score=signal.score,
            signal_description=signal.description,
            opportunity_type=opportunity_type,
            company_name=enriched_company.get("name"),
            company_domain=enriched_company.get("domain"),
            company_industry=enriched_company.get("industry") or industry,
            company_country=enriched_company.get("country"),
            lead_name=enriched_lead.get("full_name"),
            lead_title=enriched_lead.get("title") or linkedin.get("lead_title"),
            lead_email=enriched_lead.get("email"),
            lead_seniority=enriched_lead.get("seniority") or linkedin.get("lead_seniority"),
            raw_payload=raw,
            analysis_tags=analysis.get("tags", []),
            primary_analyzer=analysis.get("primary_analyzer"),
            success_hints=hints,
            market_insights=market_insights,
            active_variant=variant_ref,
            similar_wins=similar_wins,
            cautionary_patterns=cautionary_patterns,
            external_profile=linkedin,
            external_intent_keywords=list(dict.fromkeys(intent_keywords)),
            external_providers_called=ext.get("providers_called") or [],
            psychographic_style=psychographic_style,
            psychographic_tone=psychographic_tone,
            dark_funnel_score=dark_funnel_score,
            dark_funnel_stage=dark_funnel_stage,
            intro_paths=intro_paths,
            brand_brief=brand_brief,
        )

    def _query_brand_brief(self, signal: Signal) -> str:
        """Retrieve the CEO brand voice context from PersonalBrandService.

        Non-blocking: any failure (no active profile, vector store
        unavailable) returns "" so a battlecard is never blocked on this —
        same defensive pattern every other _query_* helper here follows.
        """
        try:
            from app.services.personal_brand import PersonalBrandService
            from app.services.vector_store import get_vector_store

            svc = PersonalBrandService(self.session, get_vector_store())
            return svc.generate_brand_brief(
                topic=signal.title[:200], organization_id=signal.organization_id
            )
        except Exception:  # noqa: BLE001
            logger.debug("PersonalBrandService unavailable — brand_brief will be empty", exc_info=True)
            return ""

    def _query_psychographic(self, lead_id: uuid.UUID | None) -> tuple[str | None, str | None]:
        """Retrieve the lead's DISC style from PsychographicAnalyzer.

        Non-blocking: returns ``(None, None)`` when there's no lead, or the
        analyzer is unavailable, so a failure here never blocks strategy
        generation.
        """
        if not lead_id:
            return None, None
        try:
            from app.models.lead import Lead
            from app.services.psychographic import PsychographicAnalyzer

            lead = self.session.get(Lead, lead_id)
            if not lead:
                return None, None
            profile = PsychographicAnalyzer(self.session).get_or_classify(lead)
            return profile.dominant_style, profile.preferred_tone
        except Exception:  # noqa: BLE001
            logger.warning(
                "PsychographicAnalyzer query failed; proceeding without DISC style", exc_info=True
            )
            return None, None

    def _query_dark_funnel(self, company_domain: str | None) -> tuple[float | None, str | None]:
        """Retrieve the company's research-intent score from DarkFunnelService.

        Non-blocking: returns ``(None, None)`` when there's no domain to look
        up, or the service is unavailable.
        """
        if not company_domain:
            return None, None
        try:
            from app.services.dark_funnel import DarkFunnelService

            score = DarkFunnelService(self.session).get_company_score(company_domain)
            if not score:
                return None, None
            return score.research_intensity_score, score.buying_stage
        except Exception:  # noqa: BLE001
            logger.warning(
                "DarkFunnelService query failed; proceeding without intent score", exc_info=True
            )
            return None, None

    def _query_intro_paths(
        self,
        company_domain: str | None,
        company_name: str | None,
        lead_name: str | None,
    ) -> list:
        """Retrieve warm introduction paths from NetworkNavigator.

        Non-blocking: returns ``[]`` when there's no domain to look up, or
        the navigator is unavailable — the generator then falls back to a
        cold-outreach recommendation, exactly as if no path had been found.
        """
        if not company_domain:
            return []
        try:
            from app.services.network_navigator import NetworkNavigator

            result = NetworkNavigator(self.session).find_intro_paths(
                target_domain=company_domain,
                target_company=company_name,
                target_name=lead_name,
            )
            return result.paths_found
        except Exception:  # noqa: BLE001
            logger.warning(
                "NetworkNavigator query failed; proceeding without intro paths", exc_info=True
            )
            return []

    # Fetch this many candidates before filtering by outcome tag and capping
    # to top_k — the store now mixes WON and LOST documents (see
    # FeedbackLoopService._seed_vector_store / _seed_loss_pattern), so a
    # plain top_k fetch could return fewer than top_k wins if losses happen
    # to rank higher for a given query. A generous multiplier keeps both
    # _query_similar_wins and _query_cautionary_patterns honoring their
    # top_k contract even as the store grows.
    _VECTOR_QUERY_OVERFETCH = 5

    def _query_similar_wins(
        self,
        signal_type: str,
        industry: str | None,
        signal_title: str,
        top_k: int = 3,
    ) -> list[dict]:
        """Retrieve semantically similar past WON strategies from the VectorKnowledgeBase.

        The query combines signal type, industry, and the signal title so the
        retrieval focuses on deals that resembled the current context.

        Returns a list of dicts (content, score, playbook, channel, industry)
        that generators inject as few-shot examples for channel/playbook bias.

        Excludes any document explicitly tagged ``outcome="lost"`` — a
        cautionary pattern must never surface here (see
        ``_query_cautionary_patterns`` for those). A document with no
        ``outcome`` tag at all (pre-existing/manually-seeded data) is treated
        as a win, same as before this tagging existed.

        Non-blocking: returns [] when the store is empty or unavailable.
        """
        try:
            from app.services.vector_store import get_vector_store

            store = get_vector_store()
            if store.count() == 0:
                return []

            query = (
                f"SIGNAL: {signal_type}. INDUSTRY: {industry or 'general'}. {signal_title[:100]}"
            )
            results = store.query(query, top_k=top_k * self._VECTOR_QUERY_OVERFETCH)
            wins = []
            for doc in results:
                if doc.metadata.get("outcome") == "lost":
                    continue
                if doc.score < 0.05:  # noqa: PLR2004
                    continue
                wins.append(
                    {
                        "content": doc.content[:300],
                        "similarity_score": round(doc.score, 3),
                        "playbook": doc.metadata.get("playbook"),
                        "channel": doc.metadata.get("channel"),
                        "industry": doc.metadata.get("industry"),
                        "signal_type": doc.metadata.get("signal_type"),
                        "days_to_close": doc.metadata.get("days_to_close"),
                    }
                )
                if len(wins) >= top_k:
                    break
            if wins:
                logger.info(
                    "VectorKnowledgeBase: retrieved %d similar win(s) for signal_type=%s industry=%s",
                    len(wins),
                    signal_type,
                    industry,
                )
            return wins
        except Exception:  # noqa: BLE001
            logger.warning(
                "VectorKnowledgeBase query failed — proceeding without similar wins", exc_info=True
            )
            return []

    def _query_cautionary_patterns(
        self,
        signal_type: str,
        industry: str | None,
        signal_title: str,
        top_k: int = 3,
    ) -> list[dict]:
        """Retrieve semantically similar past LOST deals as cautionary patterns.

        Same query shape as ``_query_similar_wins``, but strictly the
        opposite filter: only documents explicitly tagged
        ``outcome="lost"`` (via ``FeedbackLoopService._seed_loss_pattern``)
        are returned. The two methods never share a result.

        GUARDRAIL: a returned item is a real documented loss — see
        ``EnrichmentContext.cautionary_patterns`` for what every consumer of
        this list is required (and forbidden) to do with it.

        Non-blocking: returns [] when the store is empty, unavailable, or
        has no tagged losses close enough to this context to be useful — an
        organization with no losses yet simply gets no cautionary signal,
        never a fabricated one.
        """
        try:
            from app.services.vector_store import get_vector_store

            store = get_vector_store()
            if store.count() == 0:
                return []

            query = (
                f"SIGNAL: {signal_type}. INDUSTRY: {industry or 'general'}. {signal_title[:100]}"
            )
            results = store.query(query, top_k=top_k * self._VECTOR_QUERY_OVERFETCH)
            cautions = []
            for doc in results:
                if doc.metadata.get("outcome") != "lost":
                    continue
                if doc.score < 0.05:  # noqa: PLR2004
                    continue
                cautions.append(
                    {
                        "content": doc.content[:300],
                        "similarity_score": round(doc.score, 3),
                        "playbook": doc.metadata.get("playbook"),
                        "channel": doc.metadata.get("channel"),
                        "industry": doc.metadata.get("industry"),
                        "signal_type": doc.metadata.get("signal_type"),
                        "loss_reason": doc.metadata.get("loss_reason"),
                        "competitor": doc.metadata.get("competitor"),
                    }
                )
                if len(cautions) >= top_k:
                    break
            if cautions:
                logger.info(
                    "VectorKnowledgeBase: retrieved %d cautionary pattern(s) for signal_type=%s industry=%s",
                    len(cautions),
                    signal_type,
                    industry,
                )
            return cautions
        except Exception:  # noqa: BLE001
            logger.warning(
                "VectorKnowledgeBase cautionary query failed — proceeding without warnings",
                exc_info=True,
            )
            return []

    # Minimum recent approve/reject decisions before a generator's approval
    # rate is trusted enough to demote it — a single early rejection must
    # not permanently sideline a generator that has barely been used yet.
    _DEMOTION_MIN_SAMPLE = 5
    # More rejections than approvals over that sample is the demotion bar —
    # deliberately not a stricter threshold: this is a soft "try the next
    # generator instead," not a punishment, and errs toward giving a
    # struggling generator the benefit of the doubt above 50%.
    _DEMOTION_MAX_APPROVAL_RATE = 0.5

    def _run_generators(
        self, ctx: EnrichmentContext, organization_id: uuid.UUID | None = None
    ) -> StrategySchema | None:
        """Execute generators in priority order; return the first successful
        result. A generator with a poor recent human-approval record for
        this organization (see AuditTrailService.generator_approval_rate,
        fed by AgentOrchestrator.approve()/reject()) is skipped in favor of
        the next one — the read side of the approve/reject feedback loop.
        """
        for generator in get_strategy_generators():
            try:
                if not generator.supports(ctx):
                    continue
                if self._is_demoted(generator.name, organization_id):
                    continue
                strategy = generator.generate(ctx)

                # Tag the strategy with the active A/B variant arm so outcomes
                # can be correctly attributed when the deal closes.
                if ctx.active_variant:
                    strategy.variant_id = str(ctx.active_variant.variant_id)
                    strategy.variant_arm = ctx.active_variant.arm

                logger.debug(
                    "Generator '%s' produced strategy (signal_type=%s hints=%d insights=%d variant=%s)",
                    generator.name,
                    ctx.signal_type,
                    len(ctx.success_hints),
                    len(ctx.market_insights),
                    ctx.active_variant.arm if ctx.active_variant else None,
                )
                return strategy
            except Exception:  # noqa: BLE001
                logger.exception("Generator '%s' failed; trying next.", generator.name)
        return None

    def _is_demoted(self, generator_name: str, organization_id: uuid.UUID | None) -> bool:
        """True when this generator's recent approval rate for this
        organization is bad enough to skip it in favor of the next one.
        Never raises and never blocks generation on an audit-trail hiccup —
        the demotion signal is a soft optimization, not load-bearing.
        """
        try:
            from app.models.audit_trail import AgentType, DecisionType
            from app.services.audit_trail import AuditTrailService

            result = AuditTrailService(self.session).generator_approval_rate(
                generator_name, organization_id=organization_id, window=20
            )
            if result is None:
                return False
            approval_rate, sample_size = result
            if sample_size < self._DEMOTION_MIN_SAMPLE:
                return False
            if approval_rate >= self._DEMOTION_MAX_APPROVAL_RATE:
                return False

            AuditTrailService(self.session).record_decision(
                agent_type=AgentType.STRATEGY_GENERATOR,
                decision_type=DecisionType.GENERATOR_DEMOTED,
                organization_id=organization_id,
                generator_name=generator_name,
                strategy_reasoning=(
                    f"Generator '{generator_name}' demoted for this organization — "
                    f"{approval_rate:.0%} approval rate over its last {sample_size} decisions "
                    f"(below the {self._DEMOTION_MAX_APPROVAL_RATE:.0%} threshold)."
                ),
                confidence_score=1.0,
            )
            self.session.commit()
            logger.info(
                "StrategyGeneratorService: demoting generator=%s org=%s approval_rate=%.0f%% sample=%d",
                generator_name, organization_id, approval_rate * 100, sample_size,
            )
            return True
        except Exception:  # noqa: BLE001
            logger.exception("Demotion check failed for generator=%s — not demoting.", generator_name)
            return False
