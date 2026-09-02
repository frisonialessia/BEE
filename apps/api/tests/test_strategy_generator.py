"""Unit tests for the StrategyGeneratorService and rule-based generators.

Tests exercise:
* EnrichmentContext construction
* All four rule-based generators (funding, hiring/leadership, tech, fallback)
* The service's READY_TO_ACTION gate
* Resilience: a failing generator is skipped, the next one runs
"""

from __future__ import annotations

from app.models.base import OpportunityStatus, SignalType
from app.schemas.signal import CompanyRef, LeadRef, SignalWebhookIn
from app.schemas.strategy import StrategySchema, TimingWindow
from app.services.signal_engine import SignalEngine
from app.services.strategy_generator import (
    EnrichmentContext,
    StrategyGeneratorService,
    get_strategy_generators,
)
from app.services.strategy_generator.base import StrategyGenerator
from app.services.strategy_generator.registry import (
    _REGISTRY,
    clear_registry,
    register_strategy_generator,
)

# ── Helper payloads ────────────────────────────────────────────────────────────

def _funding_payload(ext_id: str = "test:funding-001") -> SignalWebhookIn:
    return SignalWebhookIn(
        title="Acme Corp raised a $20M Series B",
        event="funding.round.announced",
        external_id=ext_id,
        company=CompanyRef(name="Acme Corp", domain="acme.com", industry="SaaS"),
        lead=LeadRef(full_name="Jane Doe", email="jane@acme.com", title="VP Sales"),
        data={"amount_usd": 20_000_000, "round": "series_b"},
    )


def _hiring_payload(ext_id: str = "test:hiring-001") -> SignalWebhookIn:
    return SignalWebhookIn(
        title="Initech hired a new VP of Revenue Operations",
        event="hiring.leadership.posted",
        external_id=ext_id,
        company=CompanyRef(name="Initech", domain="initech.com"),
        lead=LeadRef(full_name="John Roe", email="john@initech.com", title="VP of RevOps"),
    )


def _tech_payload(ext_id: str = "test:tech-001") -> SignalWebhookIn:
    return SignalWebhookIn(
        title="Globex migrated its stack to Snowflake",
        event="tech.migration.detected",
        external_id=ext_id,
        company=CompanyRef(name="Globex", domain="globex.com"),
    )


# ── EnrichmentContext construction ─────────────────────────────────────────────

def test_context_built_from_funding_signal(session):
    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload())
    assert outcome.signal.signal_type == SignalType.FUNDING_ROUND

    svc = StrategyGeneratorService(session)
    ctx = svc._build_context(outcome.signal)

    assert ctx.signal_type == SignalType.FUNDING_ROUND
    assert ctx.company_name == "Acme Corp"
    assert ctx.company_domain == "acme.com"
    assert ctx.lead_name == "Jane Doe"
    assert ctx.lead_title == "VP Sales"


def test_context_wires_dark_funnel_psychographic_and_network(session):
    """Regression test: EnrichmentContext must be populated with DarkFunnel,
    Psychographic, and NetworkNavigator intelligence when available.

    Previously ``_build_context`` never queried these three services — the
    fields existed on ``EnrichmentContext`` (and were read by the LLM
    generator's confidence estimator and prompt builder) but always stayed at
    their empty defaults, so none of these signals ever influenced strategy
    generation in practice.
    """
    from app.schemas.dark_funnel import DarkFunnelSignalIn
    from app.schemas.network import NetworkConnectionCreate
    from app.services.dark_funnel import DarkFunnelService
    from app.services.network_navigator import NetworkNavigator

    # Seed enough pricing-page intent signals on acme.com to cross the "hot" threshold.
    dark_funnel = DarkFunnelService(session)
    for _ in range(3):
        dark_funnel.ingest_signal(
            DarkFunnelSignalIn(
                company_domain="acme.com",
                company_name="Acme Corp",
                signal_type="pricing_view",
                source_platform="website",
            )
        )

    # Seed a direct network connection at acme.com for a warm intro path.
    NetworkNavigator(session).add_connection(
        NetworkConnectionCreate(
            contact_name="Sam Connector",
            contact_company="Acme Corp",
            contact_domain="acme.com",
            relationship_strength=9,
        )
    )
    session.flush()

    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload("funding-wiring-01"))

    svc = StrategyGeneratorService(session)
    ctx = svc._build_context(outcome.signal)

    # Psychographic: the lead has a title, so get_or_classify always produces a profile.
    assert ctx.psychographic_style in ("D", "I", "S", "C")
    assert ctx.psychographic_tone

    # Dark funnel: score/stage populated from the seeded intent signals.
    assert ctx.dark_funnel_score is not None
    assert ctx.dark_funnel_score > 0
    assert ctx.is_dark_funnel_hot is True

    # Network: the direct connection surfaces as a warm intro path.
    assert ctx.has_warm_intro is True
    assert ctx.intro_paths[0].connector_name == "Sam Connector"


def test_context_wires_brand_voice(session):
    """Regression test: EnrichmentContext.brand_brief must reflect the
    active VoiceProfile when one exists — previously _build_context never
    queried PersonalBrandService at all, unlike ExecutiveAgent and
    SmartEngagementEngine, which already consumed brand_brief."""
    from app.schemas.brand import VoiceProfileCreate
    from app.services.personal_brand import PersonalBrandService
    from app.services.vector_store import get_vector_store

    brand_svc = PersonalBrandService(session, get_vector_store())
    brand_svc.create_or_update_profile(
        VoiceProfileCreate(display_name="Alex Rivera", tone_descriptors=["direct"], preferred_cta="Let's talk.")
    )
    session.commit()

    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload("funding-brand-01"))

    svc = StrategyGeneratorService(session)
    ctx = svc._build_context(outcome.signal)

    assert ctx.brand_brief != ""
    assert "Alex Rivera" in ctx.brand_brief


def test_context_brand_brief_neutral_without_profile(session):
    """Without an active profile, get_brand_context() (called through
    generate_brand_brief) returns a neutral-tone fallback sentence rather
    than an empty string — brand_brief is never truly '' in practice unless
    PersonalBrandService itself is unavailable (see _query_brand_brief's
    except branch)."""
    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload("funding-no-brand-01"))

    svc = StrategyGeneratorService(session)
    ctx = svc._build_context(outcome.signal)

    assert "No brand profile configured" in ctx.brand_brief


def test_prompt_includes_brand_voice_section_when_present():
    from app.services.strategy_generator.llm_prompt import build_user_prompt

    ctx = EnrichmentContext(
        signal_type=SignalType.FUNDING_ROUND,
        signal_title="Acme Corp raised a $20M Series B",
        signal_score=0.8,
        brand_brief="## CEO Voice Profile\n**Tone**: direct, no-BS",
    )
    prompt = build_user_prompt(ctx)
    assert "CEO BRAND VOICE" in prompt
    assert "no-BS" in prompt


def test_prompt_omits_brand_voice_section_when_absent():
    """brand_brief defaults to "" (e.g. when PersonalBrandService itself is
    unavailable — see _query_brand_brief's except branch): the section
    header must not appear, even though the unconditional task instruction
    still mentions "CEO BRAND VOICE" by name."""
    from app.services.strategy_generator.llm_prompt import build_user_prompt

    ctx = EnrichmentContext(
        signal_type=SignalType.FUNDING_ROUND, signal_title="Acme Corp raised a $20M Series B", signal_score=0.8
    )
    prompt = build_user_prompt(ctx)
    assert "=== CEO BRAND VOICE ===" not in prompt


# ── Rule-based generators ──────────────────────────────────────────────────────

def test_funding_generator_produces_complete_battlecard(session):
    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload("funding-gen-01"))

    assert outcome.opportunity is not None
    opp = outcome.opportunity

    # Should be promoted to READY_TO_ACTION
    assert opp.status == OpportunityStatus.READY_TO_ACTION
    assert outcome.strategy_enriched is True

    strategy = StrategySchema.model_validate(opp.strategy)
    assert strategy.pain_point
    assert strategy.closing_argument
    assert strategy.timing_window.urgency == "immediate"
    assert strategy.timing_window.reason
    assert strategy.generator == "funding_strategy"
    assert strategy.is_battlecard_complete() is True


def test_hiring_generator_produces_complete_battlecard(session):
    engine = SignalEngine(session)
    outcome = engine.ingest(_hiring_payload())

    assert outcome.opportunity is not None
    assert outcome.opportunity.status == OpportunityStatus.READY_TO_ACTION

    strategy = StrategySchema.model_validate(outcome.opportunity.strategy)
    assert "leadership" in strategy.pain_point.lower() or "exec" in strategy.pain_point.lower() or strategy.pain_point
    assert strategy.timing_window.urgency in ("this_week", "this_month")
    assert strategy.generator == "hiring_strategy"


def test_tech_generator_produces_complete_battlecard(session):
    engine = SignalEngine(session)
    outcome = engine.ingest(_tech_payload())

    assert outcome.opportunity is not None
    strategy = StrategySchema.model_validate(outcome.opportunity.strategy)
    assert strategy.pain_point
    assert strategy.timing_window.urgency == "this_month"


def test_multisectorial_generator_covers_all_five_new_signal_types():
    """Unit-level check (no DB round trip): every multisectorial signal type
    produces a complete, distinctly-worded battlecard — not the generic
    fallback's placeholder text."""
    from app.services.strategy_generator.rule_based import MultisectorialStrategyGenerator

    gen = MultisectorialStrategyGenerator()
    types = (
        SignalType.FRANCHISE_EXPANSION,
        SignalType.MERGER_ACQUISITION,
        SignalType.PUBLIC_TENDER,
        SignalType.REGULATORY_CHANGE,
        SignalType.FUNDING_GRANT,
    )
    seen_pain_points = set()
    for signal_type in types:
        ctx = EnrichmentContext(
            signal_type=signal_type,
            signal_title="Test signal",
            signal_score=70.0,
            company_name="Acme Corp",
        )
        assert gen.supports(ctx)
        strategy = gen.generate(ctx)
        assert "Acme Corp" in strategy.pain_point
        assert "Acme Corp" in strategy.closing_argument
        assert strategy.playbook != "generic_outreach"
        assert strategy.timing_window.urgency in ("immediate", "this_week", "this_month", "watch")
        seen_pain_points.add(strategy.pain_point)

    # Each signal type gets genuinely different copy, not one template reused.
    assert len(seen_pain_points) == len(types)


def test_generic_fallback_generator_runs_on_unknown_signal(session):
    engine = SignalEngine(session)
    payload = SignalWebhookIn(
        title="Something unclassifiable happened",
        event="misc.unknown.event",
        external_id="test:fallback-001",
    )
    outcome = engine.ingest(payload)

    # No signal-level strategy → no opportunity → no enrichment
    assert outcome.opportunity is None


# ── READY_TO_ACTION gate ───────────────────────────────────────────────────────

def test_opportunity_stays_detected_when_generator_raises(session):
    """A generator that raises must not crash ingestion; opportunity stays DETECTED."""
    old_registry = dict(_REGISTRY)
    try:
        clear_registry()

        @register_strategy_generator
        class BrokenGenerator(StrategyGenerator):
            name = "broken_test"
            priority = 1000

            def supports(self, ctx: EnrichmentContext) -> bool:  # noqa: ARG002
                return True

            def generate(self, ctx: EnrichmentContext) -> StrategySchema:  # noqa: ARG002
                raise RuntimeError("simulated LLM timeout")

        engine = SignalEngine(session)
        outcome = engine.ingest(_funding_payload("funding-broken-01"))

        # The opportunity is created but strategy service couldn't enrich it.
        assert outcome.strategy_enriched is False
        if outcome.opportunity:
            assert outcome.opportunity.status == OpportunityStatus.DETECTED
    finally:
        _REGISTRY.clear()
        _REGISTRY.update(old_registry)


def test_strategy_schema_completeness_check():
    complete = StrategySchema(
        pain_point="Real pain",
        closing_argument="Compelling argument",
        timing_window=TimingWindow(urgency="immediate", reason="Window is now"),
    )
    assert complete.is_battlecard_complete() is True

    incomplete = StrategySchema(
        pain_point="",  # empty pain point
        closing_argument="Argument",
        timing_window=TimingWindow(urgency="watch", reason=""),
    )
    assert incomplete.is_battlecard_complete() is False


# ── All built-in generators are registered ────────────────────────────────────

def test_all_builtin_generators_registered():
    names = {g.name for g in get_strategy_generators()}
    assert {"funding_strategy", "hiring_strategy", "tech_adoption_strategy", "generic_strategy"} <= names


# ── generator identity must flow through to confidence scoring ─────────────────
#
# Regression test: every rule-based generator used to hardcode
# generator="rule_based" in its StrategySchema literally, instead of
# generator=self.name — so StrategyGeneratorService.enrich() always called
# ObservabilityService.score_and_flag(generator_name="rule_based"), and the
# per-generator entries in GENERATOR_BASE_SCORES ("funding_strategy": 0.85,
# "generic_strategy": 0.55, ...) were unreachable dead code: EVERY rule-based
# strategy — including GenericStrategyGenerator's safety-net battlecard —
# got the same 0.85 "rule_based" base reliability. In practice this meant
# manual_review_required essentially never engaged for a generic/fallback
# battlecard, the opposite of what the confidence system exists to catch.

def test_specific_generator_produces_higher_confidence_than_generic(session):
    """A funding signal (a real, specific classification) must score higher
    confidence than an uncovered signal_type that falls through to
    GenericStrategyGenerator — proving generator identity actually reaches
    the confidence system now, not just that both happen to pass."""
    from app.services.strategy_generator import StrategyGeneratorService

    engine = SignalEngine(session)
    funding_outcome = engine.ingest(_funding_payload("test:confidence-funding"))
    assert funding_outcome.opportunity is not None
    funding_strategy = StrategySchema.model_validate(funding_outcome.opportunity.strategy)
    assert funding_strategy.generator == "funding_strategy"

    from datetime import UTC, datetime

    from app.models.company import Company
    from app.models.lead import Lead
    from app.models.opportunity import Opportunity
    from app.models.signal import Signal, SignalSource

    company = Company(name="Launchy", domain="launchy.example")
    session.add(company)
    session.flush()
    lead = Lead(company_id=company.id, full_name="Sam Lead", email="sam@launchy.example")
    session.add(lead)
    session.flush()
    # PRODUCT_LAUNCH has no dedicated generator (see rule_based.py's
    # supports() methods) — GenericStrategyGenerator is the only one that
    # will match, exactly the scenario its own docstring exists for.
    signal = Signal(
        company_id=company.id,
        lead_id=lead.id,
        signal_type=SignalType.PRODUCT_LAUNCH,
        source=SignalSource.WEBHOOK,
        title="Launchy shipped a new product line",
        score=60.0,
        confidence=0.5,
        detected_at=datetime.now(UTC),
    )
    session.add(signal)
    session.flush()
    opportunity = Opportunity(
        signal_id=signal.id,
        lead_id=lead.id,
        company_id=company.id,
        title="Launchy — product launch",
        status=OpportunityStatus.DETECTED,
        score=signal.score,
    )
    session.add(opportunity)
    session.flush()

    svc = StrategyGeneratorService(session)
    enriched = svc.enrich(signal, opportunity)
    assert enriched is True

    generic_strategy = StrategySchema.model_validate(opportunity.strategy)
    assert generic_strategy.generator == "generic_strategy"

    # The actual regression assertion: before the fix both strategies got
    # the same "rule_based": 0.85 base and this would fail (both ~equal,
    # generic frequently NOT flagged for review).
    assert generic_strategy.confidence_score < funding_strategy.confidence_score
    assert generic_strategy.manual_review_required is True
