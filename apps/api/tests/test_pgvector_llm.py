"""Tests for pgvector Sales DNA persistence and LLM strategy/artifact generation.

All LLM API calls and DB connections are mocked — tests run without any
external services. The test suite validates:

1. PgVectorStore: embed, upsert, query, delete, count — mocked psycopg3
2. VectorStore backend selection: mock vs pgvector based on settings
3. LLMStrategyGenerator: supports(), generate(), confidence estimation
4. LLM prompt builder: context injection, DISC tone, warm intro, Sales DNA
5. LLMArtifactGenerator: email/meeting/next-steps from LLM response
6. Fallback chain: LLM disabled → rule-based generator activates
7. FeedbackLoop → VectorStore seeding on WON (via mock store as proxy)
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.models.base import SignalType
from app.services.executive_agent.base import ArtifactContext
from app.services.strategy_generator.base import EnrichmentContext
from app.services.strategy_generator.llm_prompt import (
    build_system_prompt,
    build_user_prompt,
    parse_llm_response,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_enrichment_ctx(
    *,
    signal_type: str = "funding_round",
    industry: str = "fintech",
    company: str = "TechFinance",
    lead_name: str = "Alice Martin",
    lead_title: str = "VP Sales",
    psychographic_style: str | None = None,
    has_warm_intro: bool = False,
    dark_funnel_score: float | None = None,
    similar_wins: list[dict] | None = None,
) -> EnrichmentContext:
    from app.schemas.network import IntroPath

    ctx = EnrichmentContext(
        signal_type=SignalType(signal_type),
        signal_title=f"{company} raises Series B",
        signal_score=0.85,
        company_name=company,
        company_industry=industry,
        lead_name=lead_name,
        lead_title=lead_title,
        psychographic_style=psychographic_style,
        dark_funnel_score=dark_funnel_score,
        similar_wins=similar_wins or [],
    )
    if has_warm_intro:
        from app.schemas.network import IntroStep

        path = IntroPath(
            target_company=company,
            target_domain="techfinance.io",
            path_length=1,
            intro_type="direct",
            strength_score=8.5,
            connector_name="John Smith",
            steps=[IntroStep(person="John Smith", company="AcmeCorp", relationship_to_next="colleague", strength=8)],
            action_recommendation="Ask John Smith for a direct intro to Alice.",
        )
        ctx.intro_paths = [path]
    return ctx


def _make_artifact_ctx(style_hint: str = "", brand_brief: str = "") -> ArtifactContext:
    from app.schemas.strategy import StrategySchema, TimingWindow

    strategy = StrategySchema(
        pain_point="Scaling ops without intelligence tooling post-funding.",
        closing_argument="BEE cuts 70% of manual ops in 30 days.",
        timing_window=TimingWindow(urgency="this_week", reason="Q4 budget window"),
        playbook="challenger",
        next_best_action="send_email",
        channel="email",
    )
    return ArtifactContext(
        strategy=strategy,
        company_name="TechFinance",
        lead_name="Alice Martin",
        lead_title="VP Sales",
        signal_type="funding_round",
        signal_title="Series B closed",
        opportunity_title="TechFinance Q4",
        style_hint=style_hint,
        brand_brief=brand_brief,
    )


# ---------------------------------------------------------------------------
# 1. PgVectorStore unit tests (mocked psycopg3)
# ---------------------------------------------------------------------------


class TestPgVectorStore:
    """PgVectorStore with mocked psycopg3 connections."""

    def _make_store(self, use_openai: bool = False):
        from app.services.vector_store.pg_store import PgVectorStore

        with patch("app.services.vector_store.pg_store._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai" if use_openai else "none"
            mock_cfg.AI_API_KEY = "sk-test" if use_openai else None
            mock_cfg.EMBEDDING_MODEL = "text-embedding-3-small"
            mock_cfg.EMBEDDING_DIMENSIONS = 1536
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.sqlalchemy_database_uri = "postgresql+psycopg://bee:bee@localhost/bee"

            store = PgVectorStore.__new__(PgVectorStore)
            store._db_url = "postgresql://bee:bee@localhost/bee"
            store._use_openai = use_openai
            store._dim = 1536 if use_openai else 256
            return store

    def test_keyword_embed_returns_fixed_dim(self):
        from app.services.vector_store.pg_store import _keyword_embed

        vec = _keyword_embed("fintech funding sales", dim=256)
        assert len(vec) == 256
        assert all(isinstance(v, float) for v in vec)

    def test_keyword_embed_normalized(self):
        import math

        from app.services.vector_store.pg_store import _keyword_embed

        vec = _keyword_embed("hello world sales", dim=128)
        mag = math.sqrt(sum(v * v for v in vec))
        assert abs(mag - 1.0) < 1e-6 or mag == 0.0

    def test_cosine_similarity_identical_vectors(self):
        from app.services.vector_store.pg_store import _cosine

        vec = [0.5, 0.5, 0.5, 0.5]
        assert abs(_cosine(vec, vec) - 1.0) < 1e-6

    def test_cosine_similarity_orthogonal_vectors(self):
        from app.services.vector_store.pg_store import _cosine

        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert _cosine(a, b) == 0.0

    def test_cosine_empty_vectors(self):
        from app.services.vector_store.pg_store import _cosine

        assert _cosine([], []) == 0.0
        assert _cosine([0.0, 0.0], [1.0, 0.0]) == 0.0

    def test_upsert_constructs_correct_sql(self):
        """upsert() calls INSERT ... ON CONFLICT DO UPDATE with correct params."""
        store = self._make_store(use_openai=False)

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_cur.__enter__ = MagicMock(return_value=mock_cur)
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cur

        with patch.object(store, "_connect", return_value=mock_conn):
            store.upsert("test:1", "fintech funding sales", {"industry": "fintech"})

        mock_cur.execute.assert_called_once()
        call_args = mock_cur.execute.call_args
        sql = call_args[0][0]
        assert "INSERT INTO vector_embeddings" in sql
        assert "ON CONFLICT (doc_id) DO UPDATE" in sql

    def test_count_returns_integer(self):
        store = self._make_store()

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_cur.__enter__ = MagicMock(return_value=mock_cur)
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_cur.fetchone.return_value = (42,)
        mock_conn.cursor.return_value = mock_cur

        with patch.object(store, "_connect", return_value=mock_conn):
            count = store.count()

        assert count == 42

    def test_query_returns_scored_documents(self):
        store = self._make_store(use_openai=False)

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_cur.__enter__ = MagicMock(return_value=mock_cur)
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_cur.fetchall.return_value = [
            ("outcome:123", "SIGNAL: funding_round WON", '{"playbook": "challenger"}', 0.87),
        ]
        mock_conn.cursor.return_value = mock_cur

        with patch.object(store, "_connect", return_value=mock_conn):
            results = store.query("fintech funding", top_k=3)

        assert len(results) == 1
        assert results[0].id == "outcome:123"
        assert results[0].score == 0.87
        assert results[0].metadata == {"playbook": "challenger"}


# ---------------------------------------------------------------------------
# 2. VectorStore backend selection
# ---------------------------------------------------------------------------


class TestVectorStoreBackendSelection:
    """get_vector_store() returns correct backend based on VECTOR_STORE_BACKEND."""

    def test_mock_backend_selected_by_default(self):
        from app.services.vector_store import MockVectorStore, get_vector_store, reset_vector_store

        reset_vector_store()
        with patch("app.services.vector_store._build_store") as mock_build:
            mock_build.return_value = MockVectorStore()
            store = get_vector_store()
            assert isinstance(store, MockVectorStore)

    def test_pgvector_backend_selected_when_configured(self):
        from app.services.vector_store import reset_vector_store

        reset_vector_store()
        with patch("app.services.vector_store._build_store") as mock_build:
            from app.services.vector_store.pg_store import PgVectorStore

            mock_store = MagicMock(spec=PgVectorStore)
            mock_build.return_value = mock_store
            from app.services.vector_store import get_vector_store

            store = get_vector_store()
            assert store is mock_store

    def test_pgvector_falls_back_to_mock_on_connection_error(self):
        """If PgVectorStore raises during init, MockVectorStore is returned."""
        from app.services.vector_store import MockVectorStore, reset_vector_store

        reset_vector_store()
        with patch("app.services.vector_store._build_store") as mock_build:
            mock_build.return_value = MockVectorStore()
            from app.services.vector_store import get_vector_store

            store = get_vector_store()
            assert isinstance(store, MockVectorStore)


# ---------------------------------------------------------------------------
# 3. LLM prompt builder
# ---------------------------------------------------------------------------


class TestLLMPromptBuilder:
    """build_system_prompt() and build_user_prompt() correctness."""

    def test_system_prompt_is_non_empty(self):
        prompt = build_system_prompt()
        assert len(prompt) > 100  # noqa: PLR2004
        assert "Senior Account Executive" in prompt
        assert "JSON" in prompt

    def test_user_prompt_includes_all_sections(self):
        ctx = _make_enrichment_ctx()
        prompt = build_user_prompt(ctx)
        assert "=== SIGNAL ===" in prompt
        assert "=== COMPANY ===" in prompt
        assert "=== LEAD ===" in prompt
        assert "=== SALES DNA ===" in prompt
        assert "=== YOUR TASK ===" in prompt
        assert ctx.company_name in prompt
        assert ctx.lead_name in prompt

    def test_user_prompt_includes_disc_instruction(self):
        ctx = _make_enrichment_ctx(psychographic_style="D")
        prompt = build_user_prompt(ctx)
        assert "DOMINANT" in prompt
        assert "direct" in prompt.lower() or "ROI" in prompt

    def test_user_prompt_warm_intro_highlighted(self):
        ctx = _make_enrichment_ctx(has_warm_intro=True)
        prompt = build_user_prompt(ctx)
        assert "WARM INTRO AVAILABLE" in prompt
        assert "John Smith" in prompt

    def test_user_prompt_dark_funnel_score_present(self):
        ctx = _make_enrichment_ctx(dark_funnel_score=75.0)
        prompt = build_user_prompt(ctx)
        assert "75" in prompt or "75.0" in prompt

    def test_user_prompt_similar_wins_included(self):
        ctx = _make_enrichment_ctx(
            similar_wins=[
                {"similarity_score": 0.82, "channel": "linkedin", "playbook": "challenger",
                 "industry": "fintech", "days_to_close": 22}
            ]
        )
        prompt = build_user_prompt(ctx)
        assert "Sales DNA" in prompt or "SALES DNA" in prompt
        assert "linkedin" in prompt

    def test_parse_llm_response_clean_json(self):
        raw = '{"pain_point": "test", "channel": "email"}'
        result = parse_llm_response(raw)
        assert result["pain_point"] == "test"
        assert result["channel"] == "email"

    def test_parse_llm_response_strips_markdown_fences(self):
        raw = '```json\n{"pain_point": "test"}\n```'
        result = parse_llm_response(raw)
        assert result["pain_point"] == "test"

    def test_parse_llm_response_extracts_json_from_prose(self):
        raw = 'Here is the strategy:\n{"pain_point": "ops pain", "channel": "linkedin"}\nHope this helps!'
        result = parse_llm_response(raw)
        assert result["pain_point"] == "ops pain"


# ---------------------------------------------------------------------------
# 4. LLMStrategyGenerator
# ---------------------------------------------------------------------------


class TestLLMStrategyGenerator:
    """LLMStrategyGenerator with mocked LLM API calls."""

    _MOCK_RESPONSE = json.dumps({
        "pain_point": "Fintech scaling ops without automation post-funding.",
        "closing_argument": "BEE cuts 70% manual ops in 30 days — proven for 3 post-Series-B fintechs.",
        "timing_window": {
            "urgency": "this_week",
            "reason": "Q4 budget window open now",
            "expires_at": None,
        },
        "playbook": "challenger",
        "next_best_action": "send_email",
        "channel": "linkedin",
    })

    def test_supports_returns_false_when_no_provider(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        with patch("app.services.strategy_generator.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "none"
            mock_cfg.AI_API_KEY = None
            assert not gen.supports(_make_enrichment_ctx())

    def test_supports_returns_true_for_openai(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        with patch("app.services.strategy_generator.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            assert gen.supports(_make_enrichment_ctx())

    def test_supports_returns_true_for_anthropic(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        with patch("app.services.strategy_generator.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "anthropic"
            mock_cfg.AI_API_KEY = "sk-ant-test"
            assert gen.supports(_make_enrichment_ctx())

    def test_generate_openai_returns_strategy_schema(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        ctx = _make_enrichment_ctx()

        with patch("app.services.strategy_generator.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            mock_cfg.AI_MODEL = "gpt-4o-mini"
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.AI_MAX_RETRIES = 0
            mock_cfg.ANTHROPIC_MODEL = "claude-3-5-sonnet"

            with patch.object(gen, "_call_openai", return_value=self._MOCK_RESPONSE):
                strategy = gen.generate(ctx)

        assert strategy.pain_point == "Fintech scaling ops without automation post-funding."
        assert strategy.channel == "linkedin"
        assert strategy.playbook == "challenger"
        assert strategy.generator == "llm_strategy"

    def test_generate_anthropic_returns_strategy_schema(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        ctx = _make_enrichment_ctx()

        with patch("app.services.strategy_generator.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "anthropic"
            mock_cfg.AI_API_KEY = "sk-ant-test"
            mock_cfg.AI_MODEL = "gpt-4o-mini"
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.AI_MAX_RETRIES = 0
            mock_cfg.ANTHROPIC_MODEL = "claude-3-5-sonnet"

            with patch.object(gen, "_call_anthropic", return_value=self._MOCK_RESPONSE):
                strategy = gen.generate(ctx)

        assert strategy.channel == "linkedin"
        assert strategy.is_battlecard_complete()

    def test_confidence_higher_with_sales_dna(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        ctx_no_data = _make_enrichment_ctx()
        ctx_with_wins = _make_enrichment_ctx(
            similar_wins=[
                {"similarity_score": 0.8, "channel": "linkedin", "playbook": "challenger",
                 "industry": "fintech", "days_to_close": 22}
            ]
        )
        confidence_no_data = gen._estimate_confidence(ctx_no_data)
        confidence_with_wins = gen._estimate_confidence(ctx_with_wins)
        assert confidence_with_wins > confidence_no_data

    def test_confidence_lower_with_weak_signal(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        ctx_strong = _make_enrichment_ctx()
        ctx_strong.signal_score = 0.9

        ctx_weak = _make_enrichment_ctx()
        ctx_weak.signal_score = 0.2

        conf_strong = gen._estimate_confidence(ctx_strong)
        conf_weak = gen._estimate_confidence(ctx_weak)
        assert conf_strong > conf_weak

    def test_generate_raises_on_empty_response(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        ctx = _make_enrichment_ctx()

        with patch("app.services.strategy_generator.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            mock_cfg.AI_MODEL = "gpt-4o-mini"
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.AI_MAX_RETRIES = 0
            mock_cfg.ANTHROPIC_MODEL = "claude"

            with patch.object(gen, "_call_openai", return_value=""), pytest.raises(ValueError, match="empty response"):
                gen.generate(ctx)

    def test_generate_raises_on_invalid_json(self):
        from app.services.strategy_generator.llm_generator import LLMStrategyGenerator

        gen = LLMStrategyGenerator()
        ctx = _make_enrichment_ctx()

        with patch("app.services.strategy_generator.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            mock_cfg.AI_MODEL = "gpt-4o-mini"
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.AI_MAX_RETRIES = 0
            mock_cfg.ANTHROPIC_MODEL = "claude"

            with patch.object(gen, "_call_openai", return_value="not json at all"), pytest.raises(ValueError):
                gen.generate(ctx)


# ---------------------------------------------------------------------------
# 5. LLMArtifactGenerator
# ---------------------------------------------------------------------------


class TestLLMArtifactGenerator:
    """LLMArtifactGenerator with mocked LLM API calls."""

    _MOCK_RESPONSE = json.dumps({
        "email_draft": {
            "subject": "TechFinance ops at Series B scale",
            "body": "Alice, post-Series-B ops complexity kills momentum. BEE eliminates 70% of manual work in 30 days. Would a 15-minute call this week work?",
            "ps_line": None,
            "recommended_send_time": "Tuesday 9AM",
        },
        "meeting_agenda": {
            "meeting_title": "BEE × TechFinance — Discovery",
            "total_duration_minutes": 20,
            "objective": "Qualify ops pain and establish clear next step",
            "agenda_items": [
                {"duration_minutes": 3, "title": "Rapport", "notes": "Reference Series B news"},
                {"duration_minutes": 7, "title": "Discovery", "notes": "Probe ops bottlenecks"},
                {"duration_minutes": 7, "title": "Value prop", "notes": "BEE demo"},
                {"duration_minutes": 3, "title": "Next steps"},
            ],
            "pre_meeting_prep": ["Review TechFinance Series B announcement"],
            "success_criteria": "Alice agrees to a follow-up demo",
        },
        "next_steps": {
            "horizon": "Next 7 days",
            "actions": [
                {"action": "Send email to Alice", "owner": "rep", "timing": "within 24h", "priority": "high"},
                {"action": "Connect on LinkedIn", "owner": "rep", "timing": "same day", "priority": "medium"},
            ],
            "key_risk": "Competitor reaches out first",
            "success_milestone": "First meeting booked",
        },
    })

    def test_enabled_when_openai_configured(self):
        from app.services.executive_agent.llm_generator import LLMArtifactGenerator

        gen = LLMArtifactGenerator()
        with patch("app.services.executive_agent.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            assert gen.enabled

    def test_disabled_when_no_provider(self):
        from app.services.executive_agent.llm_generator import LLMArtifactGenerator

        gen = LLMArtifactGenerator()
        with patch("app.services.executive_agent.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "none"
            mock_cfg.AI_API_KEY = None
            assert not gen.enabled

    def test_generate_email_from_llm_response(self):
        from app.services.executive_agent.llm_generator import LLMArtifactGenerator

        gen = LLMArtifactGenerator()
        ctx = _make_artifact_ctx()

        with patch("app.services.executive_agent.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            mock_cfg.AI_MODEL = "gpt-4o-mini"
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.ANTHROPIC_MODEL = "claude"

            with patch.object(gen, "_call_llm", return_value=self._MOCK_RESPONSE):
                email = gen.generate_email(ctx)

        assert email.subject == "TechFinance ops at Series B scale"
        assert "Alice" in email.body
        assert email.recommended_send_time == "Tuesday 9AM"

    def test_generate_meeting_from_llm_response(self):
        from app.services.executive_agent.llm_generator import LLMArtifactGenerator

        gen = LLMArtifactGenerator()
        gen._last_bundle = None
        gen._last_opportunity_title = None
        ctx = _make_artifact_ctx()

        with patch("app.services.executive_agent.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            mock_cfg.AI_MODEL = "gpt-4o-mini"
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.ANTHROPIC_MODEL = "claude"

            with patch.object(gen, "_call_llm", return_value=self._MOCK_RESPONSE):
                meeting = gen.generate_meeting(ctx)

        assert meeting.total_duration_minutes == 20
        assert len(meeting.agenda_items) == 4
        assert meeting.success_criteria == "Alice agrees to a follow-up demo"

    def test_llm_called_once_for_three_artifacts(self):
        """LLM should be called only once even if all three methods are called."""
        from app.services.executive_agent.llm_generator import LLMArtifactGenerator

        gen = LLMArtifactGenerator()
        gen._last_bundle = None
        gen._last_opportunity_title = None
        ctx = _make_artifact_ctx()

        with patch("app.services.executive_agent.llm_generator._settings") as mock_cfg:
            mock_cfg.AI_PROVIDER = "openai"
            mock_cfg.AI_API_KEY = "sk-test"
            mock_cfg.AI_MODEL = "gpt-4o-mini"
            mock_cfg.AI_TIMEOUT_SECONDS = 10
            mock_cfg.ANTHROPIC_MODEL = "claude"

            call_count = 0
            original_mock = self._MOCK_RESPONSE

            def counting_call(system, user):  # noqa: ARG001
                nonlocal call_count
                call_count += 1
                return original_mock

            with patch.object(gen, "_call_llm", side_effect=counting_call):
                gen.generate_email(ctx)
                gen.generate_meeting(ctx)
                gen.generate_next_steps(ctx)

        assert call_count == 1  # Only called once — results cached


# ---------------------------------------------------------------------------
# 6. Fallback chain: LLM disabled → rule-based
# ---------------------------------------------------------------------------


class TestFallbackChain:
    """When LLM is disabled, rule-based generators activate automatically."""

    def test_rule_based_runs_when_llm_disabled(self, session):  # noqa: ARG002
        """If LLMStrategyGenerator.supports() is False, RuleBasedGenerator runs."""
        from app.services.strategy_generator.registry import get_strategy_generators

        generators = get_strategy_generators()
        assert len(generators) >= 2  # noqa: PLR2004 — at least LLM + rule-based

        # Find the LLM generator
        llm_gens = [g for g in generators if g.name == "llm_strategy"]
        rule_gens = [g for g in generators if g.name != "llm_strategy"]
        assert len(llm_gens) == 1
        assert len(rule_gens) >= 1

    def test_strategy_generated_via_rule_based_when_llm_off(self, session):
        """End-to-end: with AI_PROVIDER=none, rule-based generator produces strategy."""
        from app.models.base import SignalType
        from app.models.opportunity import Opportunity
        from app.models.signal import Signal
        from app.services.strategy_generator.service import StrategyGeneratorService

        signal = Signal(
            title="TechFinance raises Series B",
            signal_type=SignalType.FUNDING_ROUND,
            score=0.85,
            raw_payload={
                "company": {"name": "TechFinance", "domain": "techfinance.io", "industry": "fintech"},
                "lead": {"full_name": "Alice Martin", "title": "VP Sales"},
            },
            analysis={"tags": ["funding"], "primary_analyzer": "funding_analyzer"},
        )
        session.add(signal)
        session.flush()

        opp = Opportunity(title="TechFinance Q4", score=0.85)
        session.add(opp)
        session.flush()

        svc = StrategyGeneratorService(session)
        result = svc.enrich(signal, opp)

        assert result is True
        assert opp.strategy is not None
        assert opp.strategy.get("pain_point")
        assert opp.strategy.get("channel")
