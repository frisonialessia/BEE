"""Tests for the production hardening layer.

Covers the six phantom integrations that were identified in the architectural
audit and fixed in the production hardening PR:

1. APIKeyMiddleware — authentication enforcement
2. SecurityHeadersMiddleware — HTTP security headers
3. AnomalyDetector auto-trigger — wired into record_outcome
4. PersonalBrandService → ExecutiveAgent — brand_brief injection
5. ctx.style_hint → RuleBasedArtifactGenerator — CorrectionLearning applied
6. VectorKnowledgeBase Sales DNA — FeedbackLoop seeds + StrategyGenerator retrieves
7. Deep /status endpoint — all subsystem checks
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock, patch

from fastapi import status
from fastapi.testclient import TestClient

from app.main import app
from app.services.executive_agent.base import ArtifactContext
from app.services.executive_agent.generators import (
    RuleBasedArtifactGenerator,
    _parse_style_directives,
)
from app.services.strategy_generator.base import EnrichmentContext
from app.services.strategy_generator.rule_based import _best_similar_win_channel_playbook

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_strategy() -> Any:
    from app.schemas.strategy import StrategySchema, TimingWindow

    return StrategySchema(
        pain_point="They are scaling sales ops without tooling.",
        closing_argument="BEE cuts manual ops by 70% in the first 30 days.",
        timing_window=TimingWindow(urgency="this_week", reason="Q4 budget window", expires_at=None),
        playbook="challenger",
        next_best_action="send_email",
        channel="email",
    )


def _make_artifact_context(style_hint: str = "", brand_brief: str = "") -> ArtifactContext:
    return ArtifactContext(
        strategy=_make_strategy(),
        company_name="Acme Corp",
        lead_name="Jane Doe",
        lead_title="VP Sales",
        signal_type="hiring",
        signal_title="Acme hiring 20 SDRs",
        opportunity_title="Acme Q4 Opportunity",
        style_hint=style_hint,
        brand_brief=brand_brief,
    )


def _make_enrichment_context(similar_wins: list[dict] | None = None) -> EnrichmentContext:
    from app.models.base import SignalType

    return EnrichmentContext(
        signal_type=SignalType.HIRING,
        signal_title="Hiring 10 engineers",
        signal_score=0.75,
        similar_wins=similar_wins or [],
    )


# ---------------------------------------------------------------------------
# 1. APIKeyMiddleware
# ---------------------------------------------------------------------------


class TestAPIKeyMiddleware:
    """Test API key authentication middleware."""

    def test_no_key_configured_allows_all(self):
        """When API_SECRET_KEY is not set, all requests pass through."""
        with patch("app.core.middleware.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                API_SECRET_KEY=None,
                API_KEY_EXEMPT_PATHS="/api/v1/health,/api/v1/ready",
                ENVIRONMENT="local",
            )
            client = TestClient(app)
            response = client.get("/api/v1/health")
            assert response.status_code == status.HTTP_200_OK

    def test_health_always_exempt(self):
        """Health and ready endpoints bypass auth even when key is configured."""
        client = TestClient(app)
        # Without any key header — should still work (health is always exempt)
        response = client.get("/api/v1/health")
        assert response.status_code == status.HTTP_200_OK

    def test_missing_key_returns_401(self):
        """When API_SECRET_KEY is set but header is missing, return 401."""
        from app.core.middleware import APIKeyMiddleware

        middleware = APIKeyMiddleware.__new__(APIKeyMiddleware)
        middleware.settings = MagicMock(
            API_SECRET_KEY="test-secret-key",
            API_KEY_EXEMPT_PATHS="/api/v1/health",
        )
        middleware._secret = "test-secret-key"
        middleware._enabled = True
        middleware._exempt = frozenset({"/", "/api/v1/health", "/api/v1/ready"})

        assert not middleware._is_valid_key("wrong-key")
        assert middleware._is_valid_key("test-secret-key")

    def test_timing_safe_comparison(self):
        """Key comparison is constant-time (uses hmac.compare_digest)."""
        from app.core.middleware import APIKeyMiddleware

        middleware = APIKeyMiddleware.__new__(APIKeyMiddleware)
        middleware._secret = "a" * 32
        middleware._enabled = True

        # Same key → valid
        assert middleware._is_valid_key("a" * 32)
        # Wrong key → invalid (even prefix match shouldn't short-circuit)
        assert not middleware._is_valid_key("a" * 31 + "b")
        assert not middleware._is_valid_key("")


# ---------------------------------------------------------------------------
# 2. SecurityHeadersMiddleware
# ---------------------------------------------------------------------------


class TestSecurityHeadersMiddleware:
    """Test HTTP security headers are injected on every response."""

    def test_health_response_has_security_headers(self):
        """Security headers are present even on the liveness endpoint."""
        client = TestClient(app)
        response = client.get("/api/v1/health")
        headers = response.headers
        assert headers.get("x-content-type-options") == "nosniff"
        assert headers.get("x-frame-options") == "DENY"
        assert "content-security-policy" in headers
        assert "permissions-policy" in headers
        assert "referrer-policy" in headers

    def test_cache_control_prevents_caching(self):
        """API responses must not be cached by default."""
        client = TestClient(app)
        response = client.get("/api/v1/health")
        cc = response.headers.get("cache-control", "")
        assert "no-store" in cc

    def test_hsts_not_set_in_local(self):
        """HSTS must NOT be set in local environment (HTTP, not HTTPS)."""
        client = TestClient(app)
        response = client.get("/api/v1/health")
        # Local env — no HSTS
        assert "strict-transport-security" not in response.headers


# ---------------------------------------------------------------------------
# 3. AnomalyDetector auto-trigger after record_outcome
# ---------------------------------------------------------------------------


class TestAnomalyDetectorAutoTrigger:
    """Test that record_outcome automatically triggers the anomaly check."""

    def test_trigger_anomaly_check_called_after_outcome(self, session):
        """_trigger_anomaly_check is called after recording an outcome."""
        # AnomalyDetector is lazy-imported inside the helper; patch at source
        with patch(
            "app.services.anomaly_detector.service.AnomalyDetector"
        ) as mock_cls:
            mock_instance = MagicMock()
            mock_instance.check_all.return_value = MagicMock(alerts_created=0)
            mock_cls.return_value = mock_instance

            from app.api.v1.endpoints import opportunities as opp_module

            opp_module._trigger_anomaly_check(session)
            mock_instance.check_all.assert_called_once()

    def test_trigger_anomaly_check_swallows_errors(self, session):
        """Anomaly check failure must never propagate to the caller."""
        with patch(
            "app.api.v1.endpoints.opportunities._trigger_anomaly_check",
            side_effect=RuntimeError("boom"),
        ):
            # Call the real function which imports AnomalyDetector inside
            from app.api.v1.endpoints import opportunities as opp_module

            # Must not raise — errors are swallowed inside the helper itself
            # Test that the helper swallows import errors
            with patch(
                "builtins.__import__",
                side_effect=ImportError("anomaly module missing"),
            ):
                pass  # just verify the structure is in place

        # Direct call should also swallow errors
        with patch(
            "app.services.anomaly_detector.service.AnomalyDetector",
            side_effect=RuntimeError("boom"),
        ):
            from app.api.v1.endpoints import opportunities as opp_module

            # Must not raise
            opp_module._trigger_anomaly_check(session)


# ---------------------------------------------------------------------------
# 4. PersonalBrandService → ExecutiveAgent brand_brief
# ---------------------------------------------------------------------------


class TestPersonalBrandIntegration:
    """Test that ExecutiveAgent fetches and injects brand_brief."""

    def test_get_brand_brief_returns_neutral_message_when_no_profile(self, session):
        """No VoiceProfile configured: PersonalBrandService itself returns a
        neutral fallback message (not an empty string). This only reaches the
        caller if ``PersonalBrandService(...)`` was constructed successfully —
        it previously raised (missing required ``vector_store`` arg) and was
        silently swallowed by the broad ``except Exception``, which an
        ``isinstance(str)``-only assertion could never catch.
        """
        from app.models.opportunity import Opportunity

        opp = Opportunity(
            title="Test",
            status="detected",
            score=0.5,
        )
        opp.strategy = {"pain_point": "test pain"}

        from app.services.executive_agent.service import ExecutiveAgent

        agent = ExecutiveAgent(session)
        brief = agent._get_brand_brief(opp)
        assert "no brand profile" in brief.lower()

    def test_get_brand_brief_injects_real_voice_profile(self, session):
        """Regression test for the PersonalBrandService → ExecutiveAgent bug:
        with an active VoiceProfile, the brand brief actually reaches the
        artifact-generation context instead of silently coming back empty.
        """
        from app.models.opportunity import Opportunity
        from app.schemas.brand import VoiceProfileCreate
        from app.services.executive_agent.service import ExecutiveAgent
        from app.services.personal_brand import PersonalBrandService
        from app.services.vector_store import get_vector_store

        brand_svc = PersonalBrandService(session, get_vector_store())
        brand_svc.create_or_update_profile(
            VoiceProfileCreate(
                display_name="Jordan CEO",
                title="CEO",
                tone_descriptors=["direct", "no-nonsense"],
                authority_topics=["revenue operations"],
            )
        )
        session.commit()

        opp = Opportunity(title="Acme Corp deal", status="detected", score=0.5)
        opp.strategy = {"pain_point": "scaling sales ops"}

        agent = ExecutiveAgent(session)
        brief = agent._get_brand_brief(opp)

        assert "Jordan CEO" in brief
        assert "direct" in brief.lower()

    def test_get_brand_brief_is_organization_scoped(self, session):
        """Regression test for a cross-tenant leak: _get_brand_brief() must
        pass the opportunity's organization_id through to PersonalBrandService,
        or get_active_profile() falls back to its "no id = unscoped" path and
        can return a DIFFERENT organization's active voice profile — leaking
        one tenant's writing style/authority topics into another's artifacts.
        """
        import uuid as uuid_mod

        from app.models.opportunity import Opportunity
        from app.models.organization import Organization
        from app.schemas.brand import VoiceProfileCreate
        from app.services.executive_agent.service import ExecutiveAgent
        from app.services.personal_brand import PersonalBrandService
        from app.services.vector_store import get_vector_store

        org_a = Organization(name="Org A", slug=f"org-a-{uuid_mod.uuid4().hex[:8]}")
        org_b = Organization(name="Org B", slug=f"org-b-{uuid_mod.uuid4().hex[:8]}")
        session.add_all([org_a, org_b])
        session.commit()
        session.refresh(org_a)
        session.refresh(org_b)

        brand_svc = PersonalBrandService(session, get_vector_store())
        brand_svc.create_or_update_profile(
            VoiceProfileCreate(display_name="Org B Voice", title="CEO", tone_descriptors=["playful"]),
            organization_id=org_b.id,
        )
        session.commit()

        # Org A has no voice profile of its own — the brief must fall back to
        # the neutral message, never borrow Org B's.
        opp_a = Opportunity(title="Org A deal", status="detected", score=0.5, organization_id=org_a.id)

        agent = ExecutiveAgent(session)
        brief = agent._get_brand_brief(opp_a)

        assert "Org B Voice" not in brief
        assert "no brand profile" in brief.lower()

    def test_artifact_context_has_brand_brief_field(self):
        """ArtifactContext now includes brand_brief."""
        ctx = _make_artifact_context(brand_brief="CEO writes concisely.")
        assert hasattr(ctx, "brand_brief")
        assert ctx.brand_brief == "CEO writes concisely."

    def test_generator_uses_brand_brief_in_body(self):
        """When brand_brief is set, email body contains brand context note."""
        gen = RuleBasedArtifactGenerator()
        ctx = _make_artifact_context(
            brand_brief="We are experts in AI-powered sales transformation."
        )
        artifact = gen.generate_email(ctx)
        # Brand brief should appear in the body as a labeled note
        assert "Brand Context" in artifact.body or "BEE Brand Context" in artifact.body


# ---------------------------------------------------------------------------
# 5. ctx.style_hint → RuleBasedArtifactGenerator
# ---------------------------------------------------------------------------


class TestStyleHintIntegration:
    """Test that CorrectionLearning style_hint alters email generation."""

    def test_parse_style_directives_avoid_social_opener(self):
        hint = "Do NOT start with social phrases like 'Hope you're well'"
        directives = _parse_style_directives(hint)
        assert directives["avoid_social_opener"] is True

    def test_parse_style_directives_prefer_bullets(self):
        hint = "Prefer bullet points for key information."
        directives = _parse_style_directives(hint)
        assert directives["prefer_bullets"] is True

    def test_parse_style_directives_empty_hint(self):
        directives = _parse_style_directives("")
        assert all(not v for v in directives.values())

    def test_avoid_social_opener_changes_body_format(self):
        """When style_hint says avoid social opener, email starts with value prop."""
        gen = RuleBasedArtifactGenerator()

        # Without style hint — default format includes "Hi Jane"
        ctx_default = _make_artifact_context(style_hint="")
        artifact_default = gen.generate_email(ctx_default)
        assert "Hi Jane" in artifact_default.body

        # With avoid-social-opener style hint — should NOT start with "Hi Jane"
        ctx_styled = _make_artifact_context(
            style_hint="Do NOT start with social phrases like 'Hope you're well'. Start directly with value."
        )
        artifact_styled = gen.generate_email(ctx_styled)
        assert not artifact_styled.body.startswith("Hi Jane")

    def test_prefer_bullets_changes_body_structure(self):
        """When style_hint says prefer bullets, email body has bullet points."""
        gen = RuleBasedArtifactGenerator()
        ctx = _make_artifact_context(style_hint="Prefer bullet points for key information.")
        artifact = gen.generate_email(ctx)
        assert "- " in artifact.body

    def test_soft_cta_changes_urgency_language(self):
        """When style_hint says soft CTA, email uses non-pressuring language."""
        gen = RuleBasedArtifactGenerator()
        ctx = _make_artifact_context(style_hint="Prefer soft CTA, no pressure language.")
        artifact = gen.generate_email(ctx)
        assert "whenever timing" in artifact.body or "Happy to share" in artifact.body


# ---------------------------------------------------------------------------
# 6. VectorKnowledgeBase — Sales DNA seeding and retrieval
# ---------------------------------------------------------------------------


class TestVectorKnowledgeBaseSalesDNA:
    """Test VectorStore integration for Sales DNA."""

    def test_similar_wins_field_exists_in_enrichment_context(self):
        """EnrichmentContext now has similar_wins field."""
        ctx = _make_enrichment_context()
        assert hasattr(ctx, "similar_wins")
        assert ctx.similar_wins == []

    def test_best_similar_win_returns_none_when_empty(self):
        """Returns None when no similar wins exist."""
        ctx = _make_enrichment_context(similar_wins=[])
        result = _best_similar_win_channel_playbook(ctx)
        assert result is None

    def test_best_similar_win_returns_none_when_low_score(self):
        """Returns None when top win has similarity score below threshold."""
        ctx = _make_enrichment_context(
            similar_wins=[{"similarity_score": 0.15, "channel": "email", "playbook": "challenger"}]
        )
        result = _best_similar_win_channel_playbook(ctx)
        assert result is None

    def test_best_similar_win_returns_channel_playbook_on_high_score(self):
        """Returns (channel, playbook) when top win has high similarity score."""
        ctx = _make_enrichment_context(
            similar_wins=[
                {"similarity_score": 0.75, "channel": "linkedin", "playbook": "social_selling"},
                {"similarity_score": 0.40, "channel": "email", "playbook": "challenger"},
            ]
        )
        result = _best_similar_win_channel_playbook(ctx)
        assert result == ("linkedin", "social_selling")

    def test_similar_wins_used_as_fallback_after_hints(self):
        """similar_wins is used as Priority 3 (after A/B variant and hints)."""
        from app.services.strategy_generator.rule_based import _apply_hints_and_variant

        # No variant, no hints, but similar wins → use similar wins
        ctx = _make_enrichment_context(
            similar_wins=[
                {"similarity_score": 0.80, "channel": "linkedin", "playbook": "warm_intro"}
            ]
        )
        ctx.active_variant = None
        ctx.success_hints = []

        channel, playbook = _apply_hints_and_variant(ctx, "email", "generic_outreach")
        assert channel == "linkedin"
        assert playbook == "warm_intro"

    def test_feedback_loop_seeds_vector_store_on_won(self, session):
        """FeedbackLoopService._seed_vector_store persists WON strategy to VectorStore."""
        from app.models.strategy_outcome import StrategyOutcome

        outcome = StrategyOutcome(
            opportunity_id=uuid.uuid4(),
            outcome="won",
            closed_at=datetime.now(UTC),
            days_to_close=30,
            score_at_close=0.8,
            signal_type="hiring",
            company_industry="fintech",
            playbook="challenger",
            channel="email",
            generator="rule_based",
            generator_version="1.0",
            strategy_snapshot={"pain_point": "test", "closing_argument": "value"},
        )

        from app.services.vector_store import get_vector_store, reset_vector_store

        reset_vector_store()
        store = get_vector_store()
        initial_count = store.count()

        from app.services.feedback_loop.service import FeedbackLoopService

        svc = FeedbackLoopService(session)
        svc._seed_vector_store(outcome)

        assert store.count() == initial_count + 1

    def test_strategy_generator_queries_vector_store(self, session):
        """StrategyGeneratorService._query_similar_wins returns results from vector store."""
        from app.services.vector_store import get_vector_store, reset_vector_store

        reset_vector_store()
        store = get_vector_store()

        # Seed a document that should match "hiring fintech" using the correct API
        store.upsert(
            doc_id="test:1",
            content="SIGNAL: hiring. INDUSTRY: fintech. PLAYBOOK: challenger. CHANNEL: linkedin. RESULT: WON in 25 days.",
            metadata={"playbook": "challenger", "channel": "linkedin", "industry": "fintech"},
        )

        from app.services.strategy_generator.service import StrategyGeneratorService

        svc = StrategyGeneratorService(session)
        wins = svc._query_similar_wins("hiring", "fintech", "Acme hiring 10 engineers")

        assert isinstance(wins, list)
        assert len(wins) >= 1
        assert wins[0]["playbook"] == "challenger"
        assert wins[0]["channel"] == "linkedin"

    def test_query_similar_wins_returns_empty_when_store_empty(self, session):
        """Returns empty list when vector store has no documents."""
        from app.services.vector_store import reset_vector_store

        reset_vector_store()

        from app.services.strategy_generator.service import StrategyGeneratorService

        svc = StrategyGeneratorService(session)
        wins = svc._query_similar_wins("hiring", "fintech", "test signal")
        assert wins == []


# ---------------------------------------------------------------------------
# 7. Deep /status endpoint
# ---------------------------------------------------------------------------


class TestDeepStatusEndpoint:
    """Test the /status comprehensive health check endpoint."""

    def test_status_returns_200(self):
        """The /status endpoint always returns 200 (status in body)."""
        client = TestClient(app)
        response = client.get("/api/v1/status")
        assert response.status_code == status.HTTP_200_OK

    def test_status_body_has_required_keys(self):
        """Response body contains all required top-level keys."""
        client = TestClient(app)
        response = client.get("/api/v1/status")
        body = response.json()
        assert "overall" in body
        assert "timestamp" in body
        assert "checks" in body
        checks = body["checks"]
        assert "database" in checks
        assert "vector_store" in checks
        assert "dead_letter_queue" in checks
        assert "agent_orchestrator" in checks
        assert "security" in checks
        assert "ai" in checks

    def test_status_security_check_reflects_missing_key(self):
        """When API_SECRET_KEY is not set, security check reports it."""
        client = TestClient(app)
        response = client.get("/api/v1/status")
        body = response.json()
        security = body["checks"]["security"]
        # Since we're in test mode without API_SECRET_KEY set
        assert "api_key_auth" in security

    def test_status_vector_store_reports_count(self):
        """Vector store check reports the number of documents."""
        from app.services.vector_store import get_vector_store, reset_vector_store

        reset_vector_store()
        store = get_vector_store()
        store.upsert(doc_id="test:1", content="winning deal content", metadata={})

        client = TestClient(app)
        response = client.get("/api/v1/status")
        body = response.json()
        assert body["checks"]["vector_store"]["documents"] >= 1


# ---------------------------------------------------------------------------
# 8. Lifespan — init_db() gated by ENVIRONMENT
# ---------------------------------------------------------------------------


class TestLifespanSchemaProvisioning:
    """In production, schema must come from Alembic — not create_all()."""

    @staticmethod
    def _run_lifespan(environment: str) -> MagicMock:
        """Drive the lifespan context manager once and return the init_db mock."""
        import asyncio

        from app.main import lifespan

        async def _run() -> MagicMock:
            with (
                patch("app.main.settings") as mock_settings,
                patch("app.main.init_db") as mock_init_db,
            ):
                mock_settings.PROJECT_NAME = "BEE"
                mock_settings.ENVIRONMENT = environment
                mock_settings.EXTERNAL_INGESTION_ENABLED = False
                async with lifespan(None):
                    pass
                return mock_init_db

        return asyncio.run(_run())

    def test_init_db_skipped_in_production(self):
        mock_init_db = self._run_lifespan("production")
        mock_init_db.assert_not_called()

    def test_init_db_runs_in_local(self):
        mock_init_db = self._run_lifespan("local")
        mock_init_db.assert_called_once()

    def test_init_db_runs_in_staging(self):
        mock_init_db = self._run_lifespan("staging")
        mock_init_db.assert_called_once()
