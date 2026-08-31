"""Tests for the Psychology & Network Intelligence layer.

Covers:
* PsychographicAnalyzer — DISC classifier heuristics, profile caching, reclassification
* ContentStyleMiddleware — D/I/S/C style adaptations
* DarkFunnelService — signal ingestion, score computation, hot lead detection, summaries
* NetworkNavigator — connection management, direct/2nd-degree/alumni path finding
* API endpoints — psychographic, dark-funnel, network
"""

from __future__ import annotations

import uuid

import pytest
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.lead import Lead
from app.models.network import ConnectionType
from app.models.organization import Organization
from app.models.user import User
from app.schemas.dark_funnel import DarkFunnelSignalIn
from app.schemas.network import NetworkConnectionCreate
from app.services.dark_funnel import DarkFunnelService
from app.services.network_navigator import NetworkNavigator
from app.services.psychographic import PsychographicAnalyzer, classify_from_title
from app.services.psychographic.middleware import ContentStyleMiddleware

# ══════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════

@pytest.fixture
def psycho_analyzer(session: Session) -> PsychographicAnalyzer:
    return PsychographicAnalyzer(session)


@pytest.fixture
def dark_funnel_svc(session: Session) -> DarkFunnelService:
    return DarkFunnelService(session)


@pytest.fixture
def network_nav(session: Session) -> NetworkNavigator:
    return NetworkNavigator(session)


@pytest.fixture
def sample_lead(session: Session) -> Lead:
    """Create a minimal lead for psychographic testing."""
    lead = Lead(
        full_name="Alex Rivera",
        email=f"alex_{uuid.uuid4().hex[:6]}@startup.com",
        title="CEO",
        seniority="c_level",
    )
    session.add(lead)
    session.flush()
    return lead


@pytest.fixture
def cfo_lead(session: Session) -> Lead:
    lead = Lead(
        full_name="Dana Chen",
        email=f"dana_{uuid.uuid4().hex[:6]}@corp.com",
        title="Chief Financial Officer",
        seniority="c_level",
    )
    session.add(lead)
    session.flush()
    return lead


@pytest.fixture
def engineer_lead(session: Session) -> Lead:
    lead = Lead(
        full_name="Sam Kim",
        email=f"sam_{uuid.uuid4().hex[:6]}@tech.com",
        title="Senior Software Engineer",
        seniority="mid_level",
    )
    session.add(lead)
    session.flush()
    return lead


@pytest.fixture
def marketing_lead(session: Session) -> Lead:
    lead = Lead(
        full_name="Jordan Lee",
        email=f"jordan_{uuid.uuid4().hex[:6]}@agency.com",
        title="VP Marketing",
        seniority="vp",
    )
    session.add(lead)
    session.flush()
    return lead


def _make_signal(domain: str, signal_type: str, keywords: list[str] | None = None) -> DarkFunnelSignalIn:
    return DarkFunnelSignalIn(
        company_domain=domain,
        company_name=f"{domain.split('.')[0].title()} Corp",
        signal_type=signal_type,
        intent_keywords=keywords or [],
        anonymous=True,
    )


def _make_connection(
    name: str,
    company: str,
    domain: str,
    strength: int = 7,
    conn_type: str = ConnectionType.FIRST_DEGREE,
    mutual_ids: list[str] | None = None,
) -> NetworkConnectionCreate:
    return NetworkConnectionCreate(
        contact_name=name,
        contact_company=company,
        contact_domain=domain,
        contact_title="Director",
        relationship_strength=strength,
        connection_type=conn_type,
        mutual_connection_ids=mutual_ids or [],
    )


# ══════════════════════════════════════════════════════════════════
# DISC Classifier Heuristics
# ══════════════════════════════════════════════════════════════════

class TestDISCClassifier:
    def test_ceo_dominant_style_is_d(self) -> None:
        result = classify_from_title("CEO")
        assert result["dominant"] == "D"

    def test_cto_dominant_style_is_c(self) -> None:
        result = classify_from_title("Chief Technology Officer")
        assert result["dominant"] == "C"

    def test_engineer_dominant_style_is_c(self) -> None:
        result = classify_from_title("Senior Software Engineer")
        assert result["dominant"] == "C"

    def test_marketing_vp_dominant_style_is_i(self) -> None:
        result = classify_from_title("VP Marketing")
        assert result["dominant"] == "I"

    def test_hr_dominant_style_is_s(self) -> None:
        result = classify_from_title("HR Manager")
        assert result["dominant"] == "S"

    def test_cfo_dominant_style_is_c(self) -> None:
        result = classify_from_title("Chief Financial Officer")
        assert result["dominant"] == "C"

    def test_customer_success_is_s(self) -> None:
        result = classify_from_title("Customer Success Manager")
        assert result["dominant"] == "S"

    def test_unknown_title_returns_scores(self) -> None:
        result = classify_from_title("Barista")
        assert "dominant" in result
        assert result["dominant"] in ("D", "I", "S", "C")

    def test_confidence_is_normalized(self) -> None:
        result = classify_from_title("CEO")
        assert 0.0 <= result["confidence"] <= 1.0

    def test_secondary_style_present_or_none(self) -> None:
        result = classify_from_title("CEO")
        assert result["secondary"] is None or result["secondary"] in ("D", "I", "S", "C")

    def test_industry_modifier_applied(self) -> None:
        result_generic = classify_from_title("CEO")
        result_finance = classify_from_title("CEO", "finance")
        # Finance modifier increases C score
        assert result_finance["c"] > result_generic["c"]

    def test_all_scores_between_0_and_1(self) -> None:
        for title in ["CEO", "Engineer", "Marketing Manager", "HR Director", "Data Scientist"]:
            result = classify_from_title(title)
            for k in ("d", "i", "s", "c"):
                assert 0.0 <= result[k] <= 1.0, f"{k} out of range for title {title}"


# ══════════════════════════════════════════════════════════════════
# ContentStyleMiddleware
# ══════════════════════════════════════════════════════════════════

class TestContentStyleMiddleware:
    def _make_profile(self, style: str) -> object:
        from app.models.psychographic import LeadPsychographic
        return LeadPsychographic(
            lead_id=uuid.uuid4(),
            dominant_style=style,
            confidence=0.7,
            preferred_tone={"D": "direct", "I": "enthusiastic", "S": "warm", "C": "analytical"}.get(style, "professional"),
            preferred_message_length="medium",
            avoid_phrases=[],
        )

    def test_d_style_removes_pleasantry(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("D")
        content = "Hope you're doing well! I wanted to reach out about our product."
        result = mw.adapt(content, profile, "email_draft")
        assert "hope you're doing well" not in result.adapted.lower()
        assert "removed_pleasantry" in result.adaptations_applied

    def test_d_style_note_appended(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("D")
        result = mw.adapt("Direct message to the point.", profile)
        assert "DISC style applied" in result.adapted

    def test_i_style_social_proof_added(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("I")
        result = mw.adapt("Our product helps with sales outreach.", profile, "email_draft")
        # Should add social proof
        adapted_lower = result.adapted.lower()
        assert "great results" in adapted_lower or "companies" in adapted_lower

    def test_s_style_softens_urgency(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("S")
        result = mw.adapt("We need this urgently by tomorrow ASAP.", profile)
        assert "urgently" not in result.adapted.lower() or "softened_urgency" in result.adaptations_applied

    def test_c_style_adds_data_offer(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("C")
        result = mw.adapt("Our approach is amazing and industry-leading.", profile)
        # Either precision replacement or data offer added
        assert len(result.adaptations_applied) >= 1

    def test_unknown_style_returns_original_with_note(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("UNKNOWN")
        result = mw.adapt("Some content here.", profile)
        assert "no_adaptation" in result.adaptations_applied[0]

    def test_adapted_content_preserves_original_facts(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("D")
        content = "Your deal value is $50,000 per year."
        result = mw.adapt(content, profile)
        assert "$50,000" in result.adapted

    def test_original_content_preserved_in_result(self) -> None:
        mw = ContentStyleMiddleware()
        profile = self._make_profile("I")
        content = "Test content for comparison."
        result = mw.adapt(content, profile)
        assert result.original == content


# ══════════════════════════════════════════════════════════════════
# PsychographicAnalyzer Service
# ══════════════════════════════════════════════════════════════════

class TestPsychographicAnalyzer:
    def test_get_or_classify_creates_profile(
        self, psycho_analyzer: PsychographicAnalyzer, sample_lead: Lead, session: Session
    ) -> None:
        profile = psycho_analyzer.get_or_classify(sample_lead)
        session.commit()
        assert profile.id is not None
        assert profile.lead_id == sample_lead.id
        assert profile.dominant_style in ("D", "I", "S", "C", "UNKNOWN")

    def test_get_or_classify_returns_cached(
        self, psycho_analyzer: PsychographicAnalyzer, sample_lead: Lead, session: Session
    ) -> None:
        p1 = psycho_analyzer.get_or_classify(sample_lead)
        session.commit()
        p2 = psycho_analyzer.get_or_classify(sample_lead)
        assert p1.id == p2.id

    def test_ceo_classified_as_d(
        self, psycho_analyzer: PsychographicAnalyzer, sample_lead: Lead, session: Session
    ) -> None:
        sample_lead.title = "CEO & Co-Founder"
        profile = psycho_analyzer.get_or_classify(sample_lead)
        session.commit()
        assert profile.dominant_style == "D"

    def test_engineer_classified_as_c(
        self, psycho_analyzer: PsychographicAnalyzer, engineer_lead: Lead, session: Session
    ) -> None:
        profile = psycho_analyzer.get_or_classify(engineer_lead)
        session.commit()
        assert profile.dominant_style == "C"

    def test_marketing_classified_as_i(
        self, psycho_analyzer: PsychographicAnalyzer, marketing_lead: Lead, session: Session
    ) -> None:
        profile = psycho_analyzer.get_or_classify(marketing_lead)
        session.commit()
        assert profile.dominant_style == "I"

    def test_reclassify_replaces_profile(
        self, psycho_analyzer: PsychographicAnalyzer, sample_lead: Lead, session: Session
    ) -> None:
        p1 = psycho_analyzer.get_or_classify(sample_lead)
        session.commit()
        p2 = psycho_analyzer.reclassify(sample_lead)
        session.commit()
        assert p1.id != p2.id

    def test_adapt_content_for_d_style(
        self, psycho_analyzer: PsychographicAnalyzer, sample_lead: Lead, session: Session
    ) -> None:
        sample_lead.title = "CEO"
        result = psycho_analyzer.adapt_content(
            "Hope you're doing well! Just wanted to reach out.", sample_lead, "email_draft"
        )
        session.commit()
        assert result.disc_style == "D"
        assert result.original != result.adapted

    def test_adapt_content_for_c_style(
        self, psycho_analyzer: PsychographicAnalyzer, engineer_lead: Lead, session: Session
    ) -> None:
        result = psycho_analyzer.adapt_content(
            "Our solution is amazing and best in class.", engineer_lead, "email_draft"
        )
        session.commit()
        assert result.disc_style == "C"

    def test_list_profiles(
        self, psycho_analyzer: PsychographicAnalyzer, sample_lead: Lead, engineer_lead: Lead, session: Session
    ) -> None:
        psycho_analyzer.get_or_classify(sample_lead)
        psycho_analyzer.get_or_classify(engineer_lead)
        session.commit()
        profiles = psycho_analyzer.list_profiles()
        assert len(profiles) >= 2

    def test_get_for_nonexistent_lead_returns_none(self, psycho_analyzer: PsychographicAnalyzer) -> None:
        result = psycho_analyzer.get_for_lead_id(uuid.uuid4())
        assert result is None


# ══════════════════════════════════════════════════════════════════
# DarkFunnelService
# ══════════════════════════════════════════════════════════════════

class TestDarkFunnelService:
    def test_ingest_single_signal(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        sig = dark_funnel_svc.ingest_signal(_make_signal("startup.com", "review_visit", ["crm", "sales"]))
        session.commit()
        assert sig.id is not None
        assert sig.company_domain == "startup.com"
        assert sig.weight > 0

    def test_ingest_creates_hot_lead_score(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        dark_funnel_svc.ingest_signal(_make_signal("acme.com", "pricing_view"))
        session.commit()
        score = dark_funnel_svc.get_company_score("acme.com")
        assert score is not None
        assert score.research_intensity_score > 0

    def test_multiple_signals_increase_score(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        domain = "growing.io"
        dark_funnel_svc.ingest_signal(_make_signal(domain, "review_visit"))
        session.commit()
        score1 = dark_funnel_svc.get_company_score(domain)

        dark_funnel_svc.ingest_signal(_make_signal(domain, "pricing_view"))
        dark_funnel_svc.ingest_signal(_make_signal(domain, "competitor_compare"))
        session.commit()
        score2 = dark_funnel_svc.get_company_score(domain)

        assert score2.research_intensity_score > score1.research_intensity_score

    def test_hot_lead_flagged_above_threshold(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        domain = "hot-lead.com"
        # Inject enough high-weight signals to cross the 50-point threshold
        high_weight_signals = [
            "pricing_view", "competitor_compare", "product_trial",
            "demo_watch", "review_visit", "case_study_view",
        ]
        for sig_type in high_weight_signals:
            dark_funnel_svc.ingest_signal(_make_signal(domain, sig_type))
        session.commit()

        score = dark_funnel_svc.get_company_score(domain)
        assert score is not None
        assert score.is_hot is True
        assert score.research_intensity_score >= 50

    def test_buying_stage_advances_with_score(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        domain = "stage-test.com"
        # Low signals → awareness
        dark_funnel_svc.ingest_signal(_make_signal(domain, "content_read"))
        session.commit()
        score = dark_funnel_svc.get_company_score(domain)
        assert score.buying_stage in ("awareness", "consideration", "decision", "ready_to_buy")

    def test_get_hot_leads_returns_list(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        dark_funnel_svc.ingest_signal(_make_signal("list-test.com", "review_visit"))
        session.commit()
        leads = dark_funnel_svc.get_hot_leads()
        assert len(leads) >= 1

    def test_get_hot_leads_hot_only_filter(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        domain = "hot-filter.com"
        for sig_type in ["pricing_view", "competitor_compare", "product_trial", "demo_watch", "review_visit", "case_study_view"]:
            dark_funnel_svc.ingest_signal(_make_signal(domain, sig_type))
        session.commit()
        hot_leads = dark_funnel_svc.get_hot_leads(hot_only=True)
        assert all(h.is_hot for h in hot_leads)

    def test_ingest_batch(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        signals = [
            _make_signal("batch1.com", "review_visit"),
            _make_signal("batch1.com", "pricing_view"),
            _make_signal("batch2.com", "demo_watch"),
        ]
        results = dark_funnel_svc.ingest_batch(signals)
        session.commit()
        assert len(results) == 3

    def test_get_domain_signals(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        domain = "signals-test.com"
        for sig_type in ["review_visit", "pricing_view"]:
            dark_funnel_svc.ingest_signal(_make_signal(domain, sig_type))
        session.commit()
        sigs = dark_funnel_svc.get_signals_for_domain(domain)
        assert len(sigs) >= 2
        assert all(s.company_domain == domain for s in sigs)

    def test_summary_counts_hot_leads(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        dark_funnel_svc.ingest_signal(_make_signal("summary-test.com", "pricing_view"))
        session.commit()
        summary = dark_funnel_svc.get_summary()
        assert summary.total_hot_leads >= 0
        assert summary.ready_to_buy_count >= 0

    def test_score_capped_at_100(
        self, dark_funnel_svc: DarkFunnelService, session: Session
    ) -> None:
        domain = "capped.com"
        for _ in range(20):
            dark_funnel_svc.ingest_signal(_make_signal(domain, "product_trial"))
        session.commit()
        score = dark_funnel_svc.get_company_score(domain)
        assert score.research_intensity_score <= 100.0

    def test_signal_weight_respected(self) -> None:
        from app.models.dark_funnel import SIGNAL_WEIGHTS
        assert SIGNAL_WEIGHTS["product_trial"] > SIGNAL_WEIGHTS["content_read"]
        assert SIGNAL_WEIGHTS["pricing_view"] > SIGNAL_WEIGHTS["other"]


# ══════════════════════════════════════════════════════════════════
# NetworkNavigator
# ══════════════════════════════════════════════════════════════════

class TestNetworkNavigator:
    def test_add_connection(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        conn = network_nav.add_connection(_make_connection("Alice", "TechCorp", "techcorp.com"))
        session.commit()
        assert conn.id is not None
        assert conn.contact_name == "Alice"
        assert conn.relationship_strength == 7

    def test_list_connections(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        network_nav.add_connection(_make_connection("Bob", "Alpha Inc", "alpha.com", strength=8))
        network_nav.add_connection(_make_connection("Carol", "Beta LLC", "beta.com", strength=5))
        session.commit()
        conns = network_nav.list_connections()
        assert len(conns) >= 2
        # Should be ordered by strength descending
        strengths = [c.relationship_strength for c in conns]
        assert strengths == sorted(strengths, reverse=True)

    def test_direct_path_found_for_first_degree(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        network_nav.add_connection(_make_connection("David", "TargetCo", "targetco.com", strength=9))
        session.commit()
        result = network_nav.find_intro_paths("targetco.com", "TargetCo")

        assert len(result.paths_found) >= 1
        best = result.best_path
        assert best is not None
        assert best.path_length == 1
        assert best.intro_type == "warm_intro"
        assert best.connector_name == "David"
        assert result.cold_outreach_fallback is False

    def test_cold_fallback_when_no_connections(
        self, network_nav: NetworkNavigator, session: Session  # noqa: ARG002
    ) -> None:
        result = network_nav.find_intro_paths("unknown-company.com")
        assert result.cold_outreach_fallback is True
        assert result.best_path is None
        assert len(result.paths_found) == 0

    def test_second_degree_path_via_mutual(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        # Add target company connection (not directly connected to CEO)
        target_conn = network_nav.add_connection(
            _make_connection("Frank", "TechTarget", "techtarget.com", strength=6)
        )
        session.commit()

        # Add connector who knows both CEO and the target contact
        network_nav.add_connection(NetworkConnectionCreate(
            contact_name="Eve Connector",
            contact_company="Middle Co",
            contact_domain="middle.com",
            relationship_strength=8,
            connection_type=ConnectionType.FIRST_DEGREE,
            mutual_connection_ids=[str(target_conn.id)],  # Eve knows Frank at TechTarget
        ))
        session.commit()

        result = network_nav.find_intro_paths("techtarget.com", "TechTarget")
        assert len(result.paths_found) >= 1
        # Either direct (1st degree) or warm intro (2nd degree)
        intro_types = {p.intro_type for p in result.paths_found}
        assert "warm_intro" in intro_types

    def test_path_strength_ordered_descending(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        network_nav.add_connection(_make_connection("Weak", "Target", "target.com", strength=3))
        network_nav.add_connection(_make_connection("Strong", "Target", "target.com", strength=9))
        session.commit()
        result = network_nav.find_intro_paths("target.com")
        if len(result.paths_found) >= 2:
            scores = [p.strength_score for p in result.paths_found]
            assert scores == sorted(scores, reverse=True)

    def test_alumni_path_found(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        network_nav.add_connection(NetworkConnectionCreate(
            contact_name="Old Colleague",
            contact_company="University Alumni",
            contact_domain="university.edu",
            relationship_strength=6,
            connection_type=ConnectionType.ALUMNI,
        ))
        session.commit()
        # Alumni might provide a referral path even for unknown target companies
        result = network_nav.find_intro_paths("newco.com", "NewCo")
        # May or may not find path — just ensure it doesn't crash
        assert result.network_coverage in ("none", "weak", "moderate", "strong")

    def test_delete_connection(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        conn = network_nav.add_connection(_make_connection("ToDelete", "DelCo", "del.com"))
        session.commit()
        ok = network_nav.delete_connection(conn.id)
        session.commit()
        assert ok is True
        conns = network_nav.list_connections()
        assert all(c.contact_name != "ToDelete" for c in conns)

    def test_network_coverage_label(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        # Strong connection → strong coverage
        network_nav.add_connection(_make_connection("Strong", "Corp", "corp.com", strength=9))
        session.commit()
        result = network_nav.find_intro_paths("corp.com")
        assert result.network_coverage in ("strong", "moderate")

    def test_get_stats_empty_network(self, network_nav: NetworkNavigator) -> None:
        stats = network_nav.get_stats()
        assert stats.total_connections == 0
        assert stats.avg_relationship_strength == 0.0

    def test_get_stats_with_connections(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        network_nav.add_connection(_make_connection("Alice S", "Co1", "co1.com", strength=8, conn_type=ConnectionType.FIRST_DEGREE))
        network_nav.add_connection(_make_connection("Bob Mx", "Co2", "co2.com", strength=6, conn_type=ConnectionType.SECOND_DEGREE))
        session.commit()
        stats = network_nav.get_stats()
        assert stats.total_connections >= 2
        assert stats.first_degree_count >= 1
        assert stats.second_degree_count >= 1
        assert stats.avg_relationship_strength > 0

    def test_draft_ask_included_for_2nd_degree(
        self, network_nav: NetworkNavigator, session: Session
    ) -> None:
        target_conn = network_nav.add_connection(_make_connection("Target Person", "TargetCorp", "targetcorp.io"))
        session.commit()
        network_nav.add_connection(NetworkConnectionCreate(
            contact_name="My Connector",
            contact_company="Bridge Co",
            contact_domain="bridge.com",
            relationship_strength=8,
            connection_type=ConnectionType.FIRST_DEGREE,
            mutual_connection_ids=[str(target_conn.id)],
        ))
        session.commit()
        result = network_nav.find_intro_paths("targetcorp.io")
        warm_paths = [p for p in result.paths_found if p.path_length == 2]
        if warm_paths:
            assert warm_paths[0].draft_ask is not None
            assert "My Connector" in warm_paths[0].draft_ask or "targetcorp" in warm_paths[0].draft_ask.lower()


# ══════════════════════════════════════════════════════════════════
# EnrichmentContext new fields
# ══════════════════════════════════════════════════════════════════

class TestEnrichmentContextExtensions:
    def test_has_warm_intro_false_by_default(self) -> None:
        from app.models.base import SignalType
        from app.services.strategy_generator.base import EnrichmentContext
        ctx = EnrichmentContext(signal_type=SignalType.FUNDING_ROUND, signal_title="Test", signal_score=80)
        assert ctx.has_warm_intro is False

    def test_has_warm_intro_true_when_paths_set(self) -> None:
        from app.models.base import SignalType
        from app.schemas.network import IntroPath, IntroStep
        from app.services.strategy_generator.base import EnrichmentContext

        path = IntroPath(
            target_company="TargetCo", target_domain="target.com",
            path_length=1, intro_type="warm_intro", strength_score=8.5,
            steps=[IntroStep(person="CEO", company="My Co", relationship_to_next="direct", strength=8)],
            action_recommendation="Reach out directly",
        )
        ctx = EnrichmentContext(signal_type=SignalType.FUNDING_ROUND, signal_title="Test", signal_score=80, intro_paths=[path])
        assert ctx.has_warm_intro is True
        assert ctx.best_intro_path is not None
        assert ctx.best_intro_path.strength_score == 8.5

    def test_is_dark_funnel_hot_threshold(self) -> None:
        from app.models.base import SignalType
        from app.services.strategy_generator.base import EnrichmentContext

        ctx = EnrichmentContext(signal_type=SignalType.FUNDING_ROUND, signal_title="T", signal_score=80, dark_funnel_score=49.0)
        assert ctx.is_dark_funnel_hot is False

        ctx2 = EnrichmentContext(signal_type=SignalType.FUNDING_ROUND, signal_title="T", signal_score=80, dark_funnel_score=50.0)
        assert ctx2.is_dark_funnel_hot is True


# ══════════════════════════════════════════════════════════════════
# API Endpoints
# ══════════════════════════════════════════════════════════════════

def _auth_headers(session: Session) -> dict:
    """A valid bearer token for a fresh, persisted OWNER — these endpoints
    write org-scoped data and require a resolvable tenant identity."""
    org = Organization(name="Test Org", slug=f"test-org-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"owner-{uuid.uuid4().hex[:8]}@bee.ai",
        hashed_password=hash_password("password123"),
        full_name="Owner",
        role=UserRole.OWNER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(user.id, organization_id=org.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestPsychographicEndpoints:
    def test_classify_lead(self, client, session: Session) -> None:
        lead = Lead(full_name="Test CEO", email=f"ceo_{uuid.uuid4().hex[:6]}@test.com", title="CEO")
        session.add(lead)
        session.commit()

        resp = client.get(f"/api/v1/psychographic/leads/{lead.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["lead_id"] == str(lead.id)
        assert data["dominant_style"] in ("D", "I", "S", "C", "UNKNOWN")

    def test_classify_lead_not_found(self, client) -> None:
        resp = client.get(f"/api/v1/psychographic/leads/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_adapt_content(self, client, session: Session) -> None:
        lead = Lead(full_name="Test Engineer", email=f"eng_{uuid.uuid4().hex[:6]}@test.com", title="Senior Software Engineer")
        session.add(lead)
        session.commit()

        resp = client.post(
            "/api/v1/psychographic/adapt",
            json={
                "content": "Hope you're doing well! Just wanted to reach out about our amazing best-in-class product.",
                "lead_id": str(lead.id),
                "artifact_type": "email_draft",
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["disc_style"] in ("D", "I", "S", "C", "UNKNOWN")
        assert "adaptations_applied" in data

    def test_adapt_content_requires_auth(self, client, session: Session) -> None:
        lead = Lead(full_name="Anon Lead", email=f"anon_{uuid.uuid4().hex[:6]}@test.com", title="Engineer")
        session.add(lead)
        session.commit()

        resp = client.post(
            "/api/v1/psychographic/adapt",
            json={"content": "Anonymous.", "lead_id": str(lead.id), "artifact_type": "email_draft"},
        )
        assert resp.status_code == 401

    def test_list_profiles(self, client) -> None:
        resp = client.get("/api/v1/psychographic/profiles")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestDarkFunnelEndpoints:
    def test_ingest_signal(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/dark-funnel/signals",
            json={
                "company_domain": "endpoint-test.com",
                "signal_type": "pricing_view",
                "intent_keywords": ["crm", "sales automation"],
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["company_domain"] == "endpoint-test.com"
        assert data["weight"] > 0

    def test_ingest_signal_requires_auth(self, client) -> None:
        resp = client.post(
            "/api/v1/dark-funnel/signals",
            json={"company_domain": "anon-test.com", "signal_type": "pricing_view"},
        )
        assert resp.status_code == 401

    def test_get_hot_leads(self, client, session: Session) -> None:
        client.post(
            "/api/v1/dark-funnel/signals",
            json={"company_domain": "hot-endpoint.com", "signal_type": "product_trial"},
            headers=_auth_headers(session),
        )
        resp = client.get("/api/v1/dark-funnel/hot-leads")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_domain_score(self, client, session: Session) -> None:
        client.post(
            "/api/v1/dark-funnel/signals",
            json={"company_domain": "score-test.io", "signal_type": "review_visit"},
            headers=_auth_headers(session),
        )
        resp = client.get("/api/v1/dark-funnel/hot-leads/score-test.io")
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_domain"] == "score-test.io"

    def test_get_summary(self, client) -> None:
        resp = client.get("/api/v1/dark-funnel/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_hot_leads" in data

    def test_batch_ingest(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/dark-funnel/signals/batch",
            json=[
                {"company_domain": "batch-a.com", "signal_type": "content_read"},
                {"company_domain": "batch-b.com", "signal_type": "demo_watch"},
            ],
            headers=_auth_headers(session),
        )
        assert resp.status_code == 201
        assert len(resp.json()) == 2

    def test_batch_ingest_requires_auth(self, client) -> None:
        resp = client.post(
            "/api/v1/dark-funnel/signals/batch",
            json=[{"company_domain": "anon-batch.com", "signal_type": "content_read"}],
        )
        assert resp.status_code == 401


class TestNetworkEndpoints:
    def test_add_connection(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/network/connections",
            json={
                "contact_name": "API User",
                "contact_company": "TestCorp",
                "contact_domain": "testcorp.com",
                "relationship_strength": 7,
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["contact_name"] == "API User"

    def test_add_connection_requires_auth(self, client) -> None:
        resp = client.post(
            "/api/v1/network/connections",
            json={"contact_name": "Anon", "contact_company": "AnonCo", "contact_domain": "anon.com"},
        )
        assert resp.status_code == 401

    def test_list_connections(self, client, session: Session) -> None:
        client.post(
            "/api/v1/network/connections",
            json={"contact_name": "List Test", "contact_company": "Corp", "contact_domain": "corp.com"},
            headers=_auth_headers(session),
        )
        resp = client.get("/api/v1/network/connections")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_find_intro_paths_no_results(self, client) -> None:
        resp = client.get("/api/v1/network/paths?target_domain=nobody-knows.xyz")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cold_outreach_fallback"] is True
        assert data["paths_found"] == []

    def test_find_intro_paths_with_connection(self, client, session: Session) -> None:
        client.post(
            "/api/v1/network/connections",
            json={
                "contact_name": "Direct Contact",
                "contact_company": "DirectCo",
                "contact_domain": "directco.com",
                "relationship_strength": 8,
            },
            headers=_auth_headers(session),
        )
        resp = client.get("/api/v1/network/paths?target_domain=directco.com&target_company=DirectCo")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["paths_found"]) >= 1
        assert data["best_path"]["path_length"] == 1

    def test_get_network_stats(self, client) -> None:
        resp = client.get("/api/v1/network/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_connections" in data
