"""Tests for the Autonomous Growth layer.

Covers:
* IVectorStore / MockVectorStore — embedding, cosine similarity, metadata filtering
* PersonalBrandService — profile management, fragment storage, semantic retrieval
* OmnichannelGateway — provider registry, rate limiting, approval gate, mock dispatch
* SmartEngagementEngine — classification, draft generation, dedup, PendingAction creation
* DynamicSequenceEngine — sequence definition, execution, state transitions
* API endpoints — brand, engagement, sequences
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import patch

import pytest
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.sequence import ExecutionStatus
from app.models.user import User
from app.schemas.brand import BrandFragmentCreate, VoiceProfileCreate
from app.schemas.engagement import IncomingEventIn
from app.schemas.sequence import ExecutionCreate, SequenceCreate, StepDefinition, StepTransition
from app.services.dynamic_sequence import DynamicSequenceEngine, TransitionEvaluator
from app.services.omnichannel import OmnichannelGateway
from app.services.personal_brand import PersonalBrandService
from app.services.smart_engagement import SmartEngagementEngine
from app.services.vector_store import MockVectorStore, reset_vector_store

# ══════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def reset_store() -> None:
    """Ensure the vector store singleton is fresh for each test."""
    reset_vector_store()


@pytest.fixture
def vector_store() -> MockVectorStore:
    return MockVectorStore()


@pytest.fixture
def brand_svc(session: Session) -> PersonalBrandService:
    from app.services.vector_store import get_vector_store
    return PersonalBrandService(session, get_vector_store())


@pytest.fixture
def profile(brand_svc: PersonalBrandService, session: Session):
    data = VoiceProfileCreate(
        display_name="Alex Rivera",
        title="Co-Founder & CEO",
        tone_descriptors=["analytical", "direct", "no-BS"],
        authority_topics=["B2B SaaS", "go-to-market", "AI in sales"],
        forbidden_phrases=["leverage synergies", "circle back"],
        preferred_cta="Let's talk.",
        use_emojis=False,
    )
    p = brand_svc.create_or_update_profile(data)
    session.commit()
    return p


@pytest.fixture
def gateway(session: Session) -> OmnichannelGateway:
    return OmnichannelGateway(session)


@pytest.fixture
def engagement_engine(session: Session, brand_svc: PersonalBrandService, gateway: OmnichannelGateway) -> SmartEngagementEngine:
    return SmartEngagementEngine(session, brand_svc, gateway)


@pytest.fixture
def sequence_engine(session: Session) -> DynamicSequenceEngine:
    return DynamicSequenceEngine(session)


def _sample_sequence(name: str = "test_seq") -> SequenceCreate:
    return SequenceCreate(
        name=name,
        description="Test sequence",
        signal_type="funding_round",
        entry_step_id="s1",
        steps=[
            StepDefinition(
                id="s1",
                name="Intro Email",
                action="send_email",
                channel="email",
                transitions=[
                    StepTransition(condition="email_opened", next_step_id="s2"),
                    StepTransition(condition="link_clicked", next_step_id="s3"),
                    StepTransition(condition="not_opened_3d", next_step_id="s1b"),
                ],
                max_wait_days=3,
            ),
            StepDefinition(
                id="s1b",
                name="Followup Email",
                action="send_email",
                channel="email",
                transitions=[
                    StepTransition(condition="replied", next_step_id="s2"),
                ],
                max_wait_days=5,
            ),
            StepDefinition(
                id="s2",
                name="LinkedIn Connect",
                action="linkedin_connect",
                channel="linkedin",
                transitions=[
                    StepTransition(condition="linkedin_accepted", next_step_id="s3"),
                    StepTransition(condition="not_accepted_7d", next_step_id=None),  # end
                ],
                max_wait_days=7,
            ),
            StepDefinition(
                id="s3",
                name="Book Meeting",
                action="book_meeting",
                channel="email",
                transitions=[],  # end step
                max_wait_days=14,
            ),
        ],
        max_days=30,
    )


# ══════════════════════════════════════════════════════════════════
# MockVectorStore
# ══════════════════════════════════════════════════════════════════

class TestMockVectorStore:
    def test_empty_store_returns_empty_query(self, vector_store: MockVectorStore) -> None:
        results = vector_store.query("anything")
        assert results == []

    def test_count_empty(self, vector_store: MockVectorStore) -> None:
        assert vector_store.count() == 0

    def test_upsert_and_count(self, vector_store: MockVectorStore) -> None:
        vector_store.upsert("doc1", "B2B SaaS go-to-market strategy")
        assert vector_store.count() == 1

    def test_query_returns_similar_doc(self, vector_store: MockVectorStore) -> None:
        vector_store.upsert("doc1", "B2B SaaS startup funding round capital raise")
        vector_store.upsert("doc2", "cooking recipes pasta italian food")
        results = vector_store.query("SaaS startup funding round", top_k=1)
        assert len(results) == 1
        assert results[0].id == "doc1"

    def test_identical_text_scores_one(self, vector_store: MockVectorStore) -> None:
        text = "AI sales intelligence platform for B2B"
        vector_store.upsert("d1", text)
        results = vector_store.query(text, top_k=1)
        assert results[0].score == pytest.approx(1.0, abs=1e-4)

    def test_disjoint_texts_score_zero(self, vector_store: MockVectorStore) -> None:
        vector_store.upsert("food", "cooking pasta italian tomato sauce")
        results = vector_store.query("AI sales B2B SaaS funding round")
        # Completely disjoint → score should be 0 (the doc has no shared tokens)
        for r in results:
            assert r.score == pytest.approx(0.0, abs=1e-4)

    def test_metadata_filter(self, vector_store: MockVectorStore) -> None:
        vector_store.upsert("d1", "B2B SaaS sales", metadata={"category": "example_post"})
        vector_store.upsert("d2", "B2B SaaS sales", metadata={"category": "key_insight"})
        results = vector_store.query("B2B SaaS sales", top_k=5, filter_metadata={"category": "example_post"})
        assert len(results) == 1
        assert results[0].id == "d1"

    def test_delete(self, vector_store: MockVectorStore) -> None:
        vector_store.upsert("del_me", "delete this document")
        assert vector_store.count() == 1
        vector_store.delete("del_me")
        assert vector_store.count() == 0

    def test_delete_nonexistent_no_error(self, vector_store: MockVectorStore) -> None:
        vector_store.delete("does_not_exist")  # Should not raise

    def test_upsert_replaces_existing(self, vector_store: MockVectorStore) -> None:
        vector_store.upsert("d1", "original content here")
        vector_store.upsert("d1", "completely different content about finance")
        assert vector_store.count() == 1
        results = vector_store.query("finance", top_k=1)
        assert results[0].id == "d1"

    def test_top_k_respected(self, vector_store: MockVectorStore) -> None:
        for i in range(10):
            vector_store.upsert(f"d{i}", f"B2B SaaS document number {i}")
        results = vector_store.query("B2B SaaS", top_k=3)
        assert len(results) <= 3

    def test_embed_returns_vector(self, vector_store: MockVectorStore) -> None:
        vec = vector_store.embed("hello world B2B SaaS")
        assert isinstance(vec, list)
        assert len(vec) > 0


# ══════════════════════════════════════════════════════════════════
# PersonalBrandService
# ══════════════════════════════════════════════════════════════════

class TestPersonalBrandService:
    def test_create_profile(self, brand_svc: PersonalBrandService, session: Session) -> None:
        data = VoiceProfileCreate(display_name="CEO Test", tone_descriptors=["direct"])
        profile = brand_svc.create_or_update_profile(data)
        session.commit()
        assert profile.id is not None
        assert profile.display_name == "CEO Test"
        assert profile.is_active

    def test_only_one_active_profile(self, brand_svc: PersonalBrandService, session: Session) -> None:
        for name in ["First", "Second", "Third"]:
            brand_svc.create_or_update_profile(VoiceProfileCreate(display_name=name))
            session.commit()

        active = brand_svc.get_active_profile()
        assert active is not None
        assert active.display_name == "Third"

    def test_get_active_profile_none(self, brand_svc: PersonalBrandService) -> None:
        result = brand_svc.get_active_profile()
        assert result is None

    def test_add_fragment_stores_in_vector_store(self, brand_svc: PersonalBrandService, profile, session: Session) -> None:
        frag = brand_svc.add_fragment(
            profile.id,
            BrandFragmentCreate(
                content="After a funding round, companies have 60 days to set their tech stack.",
                category="key_insight",
                tags=["funding", "SaaS"],
            ),
        )
        session.commit()
        assert frag.id is not None
        assert frag.vector_doc_id is not None

        # Verify it's in the vector store
        from app.services.vector_store import get_vector_store
        store = get_vector_store()
        assert store.count() == 1

    def test_brand_context_returns_relevant_fragments(self, brand_svc: PersonalBrandService, profile, session: Session) -> None:
        brand_svc.add_fragment(profile.id, BrandFragmentCreate(
            content="Post-funding GTM velocity is the biggest predictor of Series B success.",
            category="key_insight", tags=["funding"],
        ))
        brand_svc.add_fragment(profile.id, BrandFragmentCreate(
            content="Pasta with tomato sauce and fresh basil is a classic Italian dinner.",
            category="example_post", tags=["food"],
        ))
        session.commit()

        ctx = brand_svc.get_brand_context("startup funding round venture capital")
        assert len(ctx.relevant_fragments) >= 1
        # The funding fragment should score higher than the pasta fragment
        funding_frags = [f for f in ctx.relevant_fragments if "funding" in f.tags or "funding" in f.content.lower()]
        assert len(funding_frags) >= 1

    def test_brand_brief_contains_tone(self, brand_svc: PersonalBrandService, profile, session: Session) -> None:  # noqa: ARG002
        ctx = brand_svc.get_brand_context("test query")
        assert "analytical" in ctx.brand_brief
        assert "direct" in ctx.brand_brief

    def test_brand_context_no_profile(self, brand_svc: PersonalBrandService) -> None:
        ctx = brand_svc.get_brand_context("test")
        assert ctx.voice_profile is None
        assert "No brand profile" in ctx.brand_brief

    def test_delete_fragment(self, brand_svc: PersonalBrandService, profile, session: Session) -> None:
        frag = brand_svc.add_fragment(profile.id, BrandFragmentCreate(
            content="Test fragment to delete", category="signature_phrase",
        ))
        session.commit()

        from app.services.vector_store import get_vector_store
        assert get_vector_store().count() == 1

        ok = brand_svc.delete_fragment(frag.id)
        session.commit()
        assert ok
        assert get_vector_store().count() == 0

    def test_list_fragments_by_category(self, brand_svc: PersonalBrandService, profile, session: Session) -> None:
        for cat in ["key_insight", "key_insight", "example_post"]:
            brand_svc.add_fragment(profile.id, BrandFragmentCreate(content=f"Fragment {cat}", category=cat))
        session.commit()

        insights = brand_svc.list_fragments(profile.id, category="key_insight")
        assert len(insights) == 2
        posts = brand_svc.list_fragments(profile.id, category="example_post")
        assert len(posts) == 1


# ══════════════════════════════════════════════════════════════════
# PersonalBrandService — AI-assisted voice extraction
# ══════════════════════════════════════════════════════════════════

_SAMPLE_TEXT = """We just closed a $12M Series B to double down on B2B SaaS \
go-to-market automation. The next 90 days are about hiring, not features.
Most GTM teams drown in manual busywork instead of selling. That's the \
problem we exist to fix. Data beats opinions every time — we ship what the \
numbers say, not what feels right. Would love to grab 15 minutes this week \
to compare notes on scaling a GTM org post-Series-B?"""


class TestVoiceProfileExtraction:
    """AI_PROVIDER defaults to 'none' in the test settings, so extract_profile_draft
    exercises the heuristic path unless AI_PROVIDER/AI_API_KEY are patched."""

    def test_heuristic_extraction_grounds_topics_in_the_text(self, brand_svc: PersonalBrandService) -> None:
        result = brand_svc.extract_profile_draft(_SAMPLE_TEXT)
        assert result.generated_by == "heuristic"
        assert result.model_used is None
        assert len(result.tone_descriptors) > 0
        assert len(result.authority_topics) > 0
        # Every proposed topic must actually appear in the source text — the
        # heuristic extractor should never invent content.
        lowered = _SAMPLE_TEXT.lower()
        for topic in result.authority_topics:
            assert topic.lower() in lowered

    def test_heuristic_extraction_finds_the_cta_sentence(self, brand_svc: PersonalBrandService) -> None:
        result = brand_svc.extract_profile_draft(_SAMPLE_TEXT)
        assert result.preferred_cta is not None
        assert "15 minutes" in result.preferred_cta

    def test_heuristic_extraction_bio_summary_is_the_first_sentence(self, brand_svc: PersonalBrandService) -> None:
        result = brand_svc.extract_profile_draft(_SAMPLE_TEXT)
        assert result.bio_summary is not None
        assert result.bio_summary.startswith("We just closed a $12M Series B")

    def test_heuristic_extraction_detects_data_driven_tone(self, brand_svc: PersonalBrandService) -> None:
        result = brand_svc.extract_profile_draft(_SAMPLE_TEXT)
        assert "data-driven" in result.tone_descriptors  # text contains "$12M", "90 days", "15 minutes"

    def test_extraction_never_raises_on_minimal_text(self, brand_svc: PersonalBrandService) -> None:
        result = brand_svc.extract_profile_draft("Short but valid input text here.")
        assert result.generated_by == "heuristic"

    def test_llm_extraction_used_when_configured(self, brand_svc: PersonalBrandService) -> None:
        mock_response = json.dumps({
            "title": "CEO",
            "tone_descriptors": ["direct", "data-driven"],
            "authority_topics": ["B2B SaaS", "go-to-market"],
            "preferred_cta": "Let's grab 15 minutes this week.",
            "bio_summary": "A GTM-obsessed founder who ships on data, not opinions.",
        })
        original_provider, original_key = brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY
        try:
            brand_svc.settings.AI_PROVIDER = "openai"
            brand_svc.settings.AI_API_KEY = "sk-test"
            with patch.object(brand_svc, "_call_llm_extraction", return_value=json.loads(mock_response)):
                result = brand_svc.extract_profile_draft(_SAMPLE_TEXT)
        finally:
            brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY = original_provider, original_key
        assert result.generated_by == "llm"
        assert result.model_used == brand_svc.settings.AI_MODEL
        assert result.authority_topics == ["B2B SaaS", "go-to-market"]

    def test_llm_extraction_falls_back_to_heuristic_on_failure(self, brand_svc: PersonalBrandService) -> None:
        original_provider, original_key = brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY
        try:
            brand_svc.settings.AI_PROVIDER = "openai"
            brand_svc.settings.AI_API_KEY = "sk-test"
            with patch.object(brand_svc, "_call_llm_extraction", side_effect=RuntimeError("timeout")):
                result = brand_svc.extract_profile_draft(_SAMPLE_TEXT)
        finally:
            brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY = original_provider, original_key
        assert result.generated_by == "heuristic"


# ══════════════════════════════════════════════════════════════════
# PersonalBrandService — live voice preview (generic vs. branded)
# ══════════════════════════════════════════════════════════════════

class TestBrandVoicePreview:
    def test_returns_none_without_active_profile(self, brand_svc: PersonalBrandService) -> None:
        assert brand_svc.generate_preview("funding rounds") is None

    def test_template_preview_has_distinct_versions(self, brand_svc: PersonalBrandService, profile) -> None:  # noqa: ARG002
        result = brand_svc.generate_preview("our new pricing model")
        assert result is not None
        assert result.generated_by == "template"
        assert result.model_used is None
        assert result.generic_version != result.branded_version
        assert len(result.generic_version) > 0
        assert len(result.branded_version) > 0

    def test_template_branded_includes_preferred_cta(self, brand_svc: PersonalBrandService, profile) -> None:
        result = brand_svc.generate_preview("go-to-market strategy")
        assert result is not None
        assert profile.preferred_cta in result.branded_version

    def test_llm_preview_used_when_configured(self, brand_svc: PersonalBrandService, profile) -> None:  # noqa: ARG002
        original_provider, original_key = brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY
        try:
            brand_svc.settings.AI_PROVIDER = "openai"
            brand_svc.settings.AI_API_KEY = "sk-test"
            with patch.object(brand_svc, "_call_llm_text", side_effect=["Generic post.", "Branded post."]):
                result = brand_svc.generate_preview("AI in sales")
        finally:
            brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY = original_provider, original_key
        assert result is not None
        assert result.generated_by == "llm"
        assert result.model_used == brand_svc.settings.AI_MODEL
        assert result.generic_version == "Generic post."
        assert result.branded_version == "Branded post."

    def test_llm_preview_falls_back_to_template_on_failure(self, brand_svc: PersonalBrandService, profile) -> None:  # noqa: ARG002
        original_provider, original_key = brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY
        try:
            brand_svc.settings.AI_PROVIDER = "openai"
            brand_svc.settings.AI_API_KEY = "sk-test"
            with patch.object(brand_svc, "_call_llm_text", side_effect=RuntimeError("timeout")):
                result = brand_svc.generate_preview("expansion into new markets")
        finally:
            brand_svc.settings.AI_PROVIDER, brand_svc.settings.AI_API_KEY = original_provider, original_key
        assert result is not None
        assert result.generated_by == "template"


# ══════════════════════════════════════════════════════════════════
# OmnichannelGateway
# ══════════════════════════════════════════════════════════════════

class TestOmnichannelGateway:
    def test_default_providers_registered(self, gateway: OmnichannelGateway) -> None:
        status_list = gateway.get_channel_status()
        channels = {s["channel"] for s in status_list}
        assert "email" in channels
        assert "linkedin" in channels
        assert "twitter" in channels

    def test_all_default_providers_in_mock_mode(self, gateway: OmnichannelGateway) -> None:
        status_list = gateway.get_channel_status()
        for s in status_list:
            assert s["mock"] is True  # No credentials configured in tests

    def test_prepare_action_creates_pending_action(self, gateway: OmnichannelGateway, session: Session) -> None:
        pending = gateway.prepare_action(
            channel="email",
            recipient_id="ceo@startup.com",
            body="Congrats on the funding round! ...",
            title="Outreach to ceo@startup.com",
        )
        session.commit()
        assert pending.id is not None
        assert pending.status == "pending_approval"
        assert pending.payload["channel"] == "email"

    def test_dispatch_approved_mock_mode(self, gateway: OmnichannelGateway, session: Session) -> None:
        pending = gateway.prepare_action(
            channel="email",
            recipient_id="test@example.com",
            body="Test email body",
            title="Test outreach",
        )
        session.commit()

        result = gateway.dispatch_approved(pending)
        assert result.success is True
        assert result.mock is True
        assert result.channel == "email"

    def test_dispatch_unknown_channel_fails_gracefully(self, gateway: OmnichannelGateway, session: Session) -> None:
        from app.models.base import ActionStatus, ActionType
        from app.models.pending_action import PendingAction

        # Manually create a pending action with an unknown channel
        pending = PendingAction(
            action_type=ActionType.SEND_EMAIL,
            status=ActionStatus.PENDING_APPROVAL,
            title="Test",
            payload={"channel": "whatsapp", "recipient_id": "unknown", "body": "test"},
            generator="test",
        )
        session.add(pending)
        session.commit()

        result = gateway.dispatch_approved(pending)
        assert result.success is False
        assert "No provider registered" in (result.error or "")

    def test_token_bucket_rate_limiting(self) -> None:
        from app.services.omnichannel.gateway import TokenBucket

        bucket = TokenBucket(requests_per_hour=2, min_interval_seconds=0)
        assert bucket.can_send() is True
        assert bucket.consume() is True
        assert bucket.consume() is True
        assert bucket.consume() is False  # exhausted

    def test_token_bucket_min_interval(self) -> None:
        from app.services.omnichannel.gateway import TokenBucket

        bucket = TokenBucket(requests_per_hour=100, min_interval_seconds=10.0)
        assert bucket.consume() is True
        # Second call immediately after should be rate-limited by interval
        assert bucket.consume() is False

    def test_channel_dispatcher(self, gateway: OmnichannelGateway, session: Session) -> None:
        from app.services.omnichannel import ChannelDispatcher
        dispatcher = ChannelDispatcher(gateway)
        pending = dispatcher.dispatch(
            artifact_type="email_draft",
            channel="linkedin",
            recipient_id="johndoe",
            body="Hi John, saw your post about AI in B2B sales...",
            title="LinkedIn outreach to John Doe",
        )
        session.commit()
        assert pending.payload["channel"] == "linkedin"
        assert pending.status == "pending_approval"


class TestOrchestratorGatewayDispatch:
    """AgentOrchestrator.approve() auto-dispatches gateway-native actions.

    Regression coverage for a wiring gap: OmnichannelGateway.dispatch_approved
    and ChannelDispatcher were fully implemented and unit-tested (above) but
    never invoked from any live approval path — approving one of these
    actions used to leave it stuck in APPROVED forever, waiting on an
    external tool (n8n/Zapier) that only ever polls for the bundle-based
    actions AgentOrchestrator.create_from_bundle creates, not these.
    """

    def test_approve_dispatches_channel_action_to_completed(
        self, gateway: OmnichannelGateway, session: Session
    ) -> None:
        from app.schemas.orchestrator import ApprovalIn
        from app.services.orchestrator.service import AgentOrchestrator

        pending = gateway.prepare_action(
            channel="email",
            recipient_id="prospect@example.com",
            body="Following up on our conversation...",
            title="Outreach to prospect@example.com",
        )
        session.commit()
        assert pending.status == "pending_approval"

        orchestrator = AgentOrchestrator(session, gateway)
        approved = orchestrator.approve(pending.id, ApprovalIn(approved_by="ceo@bee.io"))

        # No manual start-execution/complete call — the gateway dispatch
        # inside approve() already carried it all the way to COMPLETED
        # (mock mode, since no real credentials are configured in tests).
        assert approved.status == "completed"
        assert approved.executing_tool == "omnichannel_gateway"

    def test_approve_bundle_action_stays_on_external_tool_path(
        self, gateway: OmnichannelGateway, session: Session
    ) -> None:
        """A create_from_bundle action has no `channel` key — approving it
        must NOT auto-dispatch; it stays APPROVED for n8n/Zapier to pick up,
        exactly as documented in AgentOrchestrator's module docstring."""
        from app.models.base import ActionStatus, ActionType
        from app.models.pending_action import PendingAction
        from app.schemas.orchestrator import ApprovalIn
        from app.services.orchestrator.service import AgentOrchestrator

        pending = PendingAction(
            action_type=ActionType.SEND_EMAIL,
            status=ActionStatus.PENDING_APPROVAL,
            title="Send email: battlecard follow-up",
            payload={"email_draft": {"subject": "Follow-up", "body": "..."}},
            generator="executive_agent",
        )
        session.add(pending)
        session.commit()
        session.refresh(pending)

        orchestrator = AgentOrchestrator(session, gateway)
        approved = orchestrator.approve(pending.id, ApprovalIn(approved_by="ceo@bee.io"))

        assert approved.status == "approved"
        assert approved.executing_tool is None


# ══════════════════════════════════════════════════════════════════
# SmartEngagementEngine
# ══════════════════════════════════════════════════════════════════

class TestSmartEngagementEngine:
    def _make_event(
        self,
        content: str,
        source: str = "linkedin",
        author: str = "Test User",
    ) -> IncomingEventIn:
        return IncomingEventIn(
            source=source,
            content=content,
            author_name=author,
            author_handle="@testuser",
        )

    def test_positive_comment_classified_correctly(
        self, engagement_engine: SmartEngagementEngine, session: Session
    ) -> None:
        event = self._make_event("Great post! Really helpful and insightful content.")
        result = engagement_engine.process(event)
        session.commit()

        assert result.sentiment in ("positive", "neutral")
        assert result.intent in ("compliment", "follow_up")
        assert result.processed is True

    def test_spam_is_ignored(self, engagement_engine: SmartEngagementEngine, session: Session) -> None:
        event = self._make_event("Buy now! Limited offer make money click here free bitcoin!")
        result = engagement_engine.process(event)
        session.commit()

        assert result.ignored is True
        assert result.pending_action_id is None
        assert result.response_draft is None

    def test_sales_interest_creates_pending_action(
        self, engagement_engine: SmartEngagementEngine, session: Session
    ) -> None:
        event = self._make_event("Interested in learning more. What's the price for 50 users?")
        result = engagement_engine.process(event)
        session.commit()

        assert result.intent == "sales_interest"
        assert result.pending_action_id is not None
        assert result.response_draft is not None

    def test_question_generates_response_draft(
        self, engagement_engine: SmartEngagementEngine, session: Session
    ) -> None:
        event = self._make_event("How do you handle multi-channel attribution in your pipeline?")
        result = engagement_engine.process(event)
        session.commit()

        assert result.sentiment == "question"
        assert result.response_draft is not None
        assert result.pending_action_id is not None

    def test_dedup_by_source_event_id(
        self, engagement_engine: SmartEngagementEngine, session: Session
    ) -> None:
        event_id = f"li_{uuid.uuid4().hex[:8]}"
        data = IncomingEventIn(
            source="linkedin",
            content="Great post about AI in B2B sales!",
            author_name="Jane Doe",
            source_event_id=event_id,
        )
        first = engagement_engine.process(data)
        session.commit()
        second = engagement_engine.process(data)
        session.commit()

        assert first.event_id == second.event_id

    def test_objection_generates_response(
        self, engagement_engine: SmartEngagementEngine, session: Session
    ) -> None:
        event = self._make_event("I disagree. This doesn't work without enterprise features.")
        result = engagement_engine.process(event)
        session.commit()

        assert result.intent == "objection"
        assert result.response_draft is not None


# ══════════════════════════════════════════════════════════════════
# DynamicSequenceEngine
# ══════════════════════════════════════════════════════════════════

class TestTransitionEvaluator:
    def _make_execution(self, events: list[str] = None):
        from datetime import UTC, datetime

        from app.models.sequence import SequenceExecution
        exec_ = SequenceExecution(
            id=uuid.uuid4(),
            sequence_id=uuid.uuid4(),
            current_step_id="s1",
            status=ExecutionStatus.RUNNING,
            events=[{"event": e, "timestamp": datetime.now(UTC).isoformat(), "metadata": {}} for e in (events or [])],
            started_at=datetime.now(UTC),
        )
        return exec_

    def test_exact_match(self) -> None:
        exec_ = self._make_execution()
        assert TransitionEvaluator.matches("email_opened", "email_opened", exec_) is True

    def test_no_match(self) -> None:
        exec_ = self._make_execution()
        assert TransitionEvaluator.matches("email_opened", "link_clicked", exec_) is False

    def test_compound_and_not(self) -> None:
        exec_ = self._make_execution(["email_opened"])
        assert TransitionEvaluator.matches("email_opened_AND_NOT_link_clicked", "email_opened", exec_) is True

    def test_compound_and_not_fails_when_both_present(self) -> None:
        exec_ = self._make_execution(["email_opened", "link_clicked"])
        assert TransitionEvaluator.matches("email_opened_AND_NOT_link_clicked", "link_clicked", exec_) is False

    def test_timeout_condition_not_yet(self) -> None:
        from datetime import UTC, datetime
        exec_ = self._make_execution()
        # started just now → 0 days elapsed → 3d timeout not met
        exec_.started_at = datetime.now(UTC)
        assert TransitionEvaluator.matches("not_opened_3d", "something_else", exec_) is False

    def test_timeout_condition_event_already_happened(self) -> None:
        from datetime import UTC, datetime
        exec_ = self._make_execution(["opened"])
        exec_.started_at = datetime(2020, 1, 1, tzinfo=UTC)
        # "opened" happened → timeout condition not met
        assert TransitionEvaluator.matches("not_opened_3d", "tick", exec_) is False


class TestDynamicSequenceEngine:
    def test_create_sequence(self, sequence_engine: DynamicSequenceEngine, session: Session) -> None:
        seq = sequence_engine.create_sequence(_sample_sequence("test_create"))
        session.commit()

        assert seq.id is not None
        assert seq.name == "test_create"
        assert len(seq.steps) == 4
        assert seq.entry_step_id == "s1"

    def test_sequence_step_map(self, sequence_engine: DynamicSequenceEngine, session: Session) -> None:
        seq = sequence_engine.create_sequence(_sample_sequence("test_map"))
        session.commit()
        step_map = seq.step_map
        assert "s1" in step_map
        assert "s2" in step_map
        assert "s3" in step_map

    def test_start_execution_creates_pending_action(
        self, sequence_engine: DynamicSequenceEngine, session: Session
    ) -> None:
        seq = sequence_engine.create_sequence(_sample_sequence("test_start"))
        session.commit()

        execution = sequence_engine.start_execution(ExecutionCreate(
            sequence_id=seq.id,
            opportunity_id=uuid.uuid4(),
        ))
        session.commit()

        assert execution.id is not None
        assert execution.current_step_id == "s1"
        assert execution.status == ExecutionStatus.RUNNING
        assert len(execution.pending_action_ids) >= 1

    def test_advance_on_email_opened(
        self, sequence_engine: DynamicSequenceEngine, session: Session
    ) -> None:
        seq = sequence_engine.create_sequence(_sample_sequence("test_advance"))
        session.commit()

        execution = sequence_engine.start_execution(ExecutionCreate(sequence_id=seq.id))
        session.commit()

        result = sequence_engine.advance(execution.id, "email_opened")
        session.commit()

        assert result.transition_triggered == "email_opened"
        assert result.current_step == "s2"

    def test_advance_on_link_clicked_skips_to_s3(
        self, sequence_engine: DynamicSequenceEngine, session: Session
    ) -> None:
        seq = sequence_engine.create_sequence(_sample_sequence("test_skip"))
        session.commit()

        execution = sequence_engine.start_execution(ExecutionCreate(sequence_id=seq.id))
        session.commit()

        result = sequence_engine.advance(execution.id, "link_clicked")
        session.commit()

        assert result.transition_triggered == "link_clicked"
        assert result.current_step == "s3"

    def test_no_matching_transition_stays_at_step(
        self, sequence_engine: DynamicSequenceEngine, session: Session
    ) -> None:
        seq = sequence_engine.create_sequence(_sample_sequence("test_no_match"))
        session.commit()

        execution = sequence_engine.start_execution(ExecutionCreate(sequence_id=seq.id))
        session.commit()

        result = sequence_engine.advance(execution.id, "unknown_event")
        session.commit()

        assert result.transition_triggered is None
        assert result.current_step == "s1"  # unchanged

    def test_sequence_completion_via_none_next_step(
        self, sequence_engine: DynamicSequenceEngine, session: Session
    ) -> None:
        # Create a minimal sequence where a transition has next_step_id=None (terminal)
        seq = sequence_engine.create_sequence(SequenceCreate(
            name="terminal_test",
            entry_step_id="s1",
            steps=[
                StepDefinition(
                    id="s1",
                    name="Only Step",
                    action="send_email",
                    transitions=[
                        StepTransition(condition="replied", next_step_id=None),  # terminal
                    ],
                )
            ],
        ))
        session.commit()

        execution = sequence_engine.start_execution(ExecutionCreate(sequence_id=seq.id))
        session.commit()

        result = sequence_engine.advance(execution.id, "replied")
        session.commit()

        assert result.status == ExecutionStatus.COMPLETED

    def test_completed_execution_cannot_advance(
        self, sequence_engine: DynamicSequenceEngine, session: Session
    ) -> None:
        seq = sequence_engine.create_sequence(SequenceCreate(
            name="completed_test",
            entry_step_id="s1",
            steps=[
                StepDefinition(id="s1", name="Step 1", action="send_email",
                               transitions=[StepTransition(condition="done", next_step_id=None)])
            ],
        ))
        session.commit()

        execution = sequence_engine.start_execution(ExecutionCreate(sequence_id=seq.id))
        session.commit()

        sequence_engine.advance(execution.id, "done")
        session.commit()

        result = sequence_engine.advance(execution.id, "done")
        assert "completed" in result.message.lower()

    def test_list_sequences(self, sequence_engine: DynamicSequenceEngine, session: Session) -> None:
        for i in range(3):
            sequence_engine.create_sequence(_sample_sequence(f"list_test_{i}"))
        session.commit()

        seqs = sequence_engine.list_sequences()
        assert len(seqs) >= 3

    def test_list_executions_by_status(self, sequence_engine: DynamicSequenceEngine, session: Session) -> None:
        seq = sequence_engine.create_sequence(_sample_sequence("status_list"))
        session.commit()

        sequence_engine.start_execution(ExecutionCreate(sequence_id=seq.id))
        session.commit()

        running = sequence_engine.list_executions(status=ExecutionStatus.RUNNING)
        assert len(running) >= 1


# ══════════════════════════════════════════════════════════════════
# Brand API endpoints
# ══════════════════════════════════════════════════════════════════

class TestBrandEndpoints:
    def test_create_profile(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/brand/profile",
            json={
                "display_name": "Alex Rivera",
                "tone_descriptors": ["analytical", "direct"],
                "authority_topics": ["B2B SaaS"],
                "language": "en",
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["display_name"] == "Alex Rivera"
        assert data["is_active"] is True

    def test_create_profile_requires_auth(self, client) -> None:
        resp = client.post("/api/v1/brand/profile", json={"display_name": "Anonymous"})
        assert resp.status_code == 401

    def test_get_profile_not_found(self, client) -> None:
        resp = client.get("/api/v1/brand/profile")
        assert resp.status_code == 404

    def test_create_and_get_profile(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        client.post("/api/v1/brand/profile", json={"display_name": "CEO Test"}, headers=headers)
        resp = client.get("/api/v1/brand/profile")
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "CEO Test"

    def test_add_fragment(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        profile_resp = client.post("/api/v1/brand/profile", json={"display_name": "CEO"}, headers=headers)
        profile_id = profile_resp.json()["id"]

        resp = client.post(
            f"/api/v1/brand/profile/{profile_id}/fragments",
            json={
                "content": "After a funding round, the first 60 days are critical for GTM.",
                "category": "key_insight",
                "tags": ["funding", "SaaS"],
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["category"] == "key_insight"
        assert "funding" in data["tags"]

    def test_extract_profile_draft(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/brand/profile/extract",
            json={"raw_text": _SAMPLE_TEXT},
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["generated_by"] == "heuristic"
        assert len(data["tone_descriptors"]) > 0
        assert len(data["authority_topics"]) > 0

    def test_extract_profile_draft_requires_auth(self, client) -> None:
        resp = client.post("/api/v1/brand/profile/extract", json={"raw_text": _SAMPLE_TEXT})
        assert resp.status_code == 401

    def test_preview_voice_without_profile(self, client) -> None:
        resp = client.post("/api/v1/brand/profile/preview", json={"topic": "our new product launch"})
        assert resp.status_code == 404

    def test_preview_voice(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        client.post(
            "/api/v1/brand/profile",
            json={"display_name": "Alex Rivera", "tone_descriptors": ["direct"], "preferred_cta": "Let's talk."},
            headers=headers,
        )
        resp = client.post(
            "/api/v1/brand/profile/preview",
            json={"topic": "our new product launch"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["topic"] == "our new product launch"
        assert data["generated_by"] == "template"
        assert data["generic_version"] != data["branded_version"]

    def test_extract_profile_draft_rejects_too_short_text(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/brand/profile/extract",
            json={"raw_text": "too short"},
            headers=_auth_headers(session),
        )
        assert resp.status_code == 422

    def test_brand_context_endpoint(self, client) -> None:
        resp = client.post("/api/v1/brand/context", json={"query": "funding round", "top_k": 3})
        assert resp.status_code == 200
        data = resp.json()
        assert "brand_brief" in data
        assert "relevant_fragments" in data

    def test_channel_status_endpoint(self, client) -> None:
        resp = client.get("/api/v1/brand/channels/status")
        assert resp.status_code == 200
        channels = {c["channel"] for c in resp.json()}
        assert "email" in channels
        assert "linkedin" in channels


# ══════════════════════════════════════════════════════════════════
# Engagement API endpoints
# ══════════════════════════════════════════════════════════════════

class TestEngagementEndpoints:
    def test_submit_positive_event(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/engagement/events",
            json={
                "source": "linkedin",
                "content": "Great post! Really insightful and helpful content.",
                "author_name": "Jane Smith",
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["processed"] is True

    def test_submit_event_requires_auth(self, client) -> None:
        resp = client.post(
            "/api/v1/engagement/events",
            json={"source": "linkedin", "content": "Anonymous submission.", "author_name": "Nobody"},
        )
        assert resp.status_code == 401

    def test_submit_spam_event(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/engagement/events",
            json={
                "source": "linkedin",
                "content": "Buy now! Limited offer make money free bitcoin click here!",
                "author_name": "Spammer",
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["ignored"] is True
        assert data["pending_action_id"] is None

    def test_list_events(self, client, session: Session) -> None:
        client.post(
            "/api/v1/engagement/events",
            json={
                "source": "twitter",
                "content": "How does your platform handle multi-touch attribution?",
                "author_name": "Curious User",
            },
            headers=_auth_headers(session),
        )
        resp = client.get("/api/v1/engagement/events")
        assert resp.status_code == 200
        events = resp.json()
        assert len(events) >= 1

    def test_get_event_not_found(self, client) -> None:
        resp = client.get(f"/api/v1/engagement/events/{uuid.uuid4()}")
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════
# Sequence API endpoints
# ══════════════════════════════════════════════════════════════════

def _auth_headers(session: Session) -> dict:
    """A valid bearer token for a fresh, persisted OWNER — the sequence
    endpoints require a resolvable tenant identity."""
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


class TestSequenceEndpoints:
    def _sample_payload(self, name: str = "api_test") -> dict:
        return {
            "name": name,
            "entry_step_id": "s1",
            "steps": [
                {
                    "id": "s1",
                    "name": "Intro Email",
                    "action": "send_email",
                    "transitions": [
                        {"condition": "email_opened", "next_step_id": "s2", "delay_days": 0},
                    ],
                    "max_wait_days": 3,
                },
                {
                    "id": "s2",
                    "name": "LinkedIn Connect",
                    "action": "linkedin_connect",
                    "transitions": [],
                    "max_wait_days": 7,
                },
            ],
            "max_days": 14,
        }

    def test_sequences_require_auth(self, client) -> None:
        resp = client.post("/api/v1/sequences", json=self._sample_payload("no_auth"))
        assert resp.status_code == 401

    def test_create_sequence(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        resp = client.post("/api/v1/sequences", json=self._sample_payload("endpoint_create"), headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "endpoint_create"
        assert len(data["steps"]) == 2

    def test_list_sequences(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        client.post("/api/v1/sequences", json=self._sample_payload("endpoint_list_1"), headers=headers)
        client.post("/api/v1/sequences", json=self._sample_payload("endpoint_list_2"), headers=headers)
        resp = client.get("/api/v1/sequences", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 2

    def test_start_execution(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        create = client.post("/api/v1/sequences", json=self._sample_payload("endpoint_exec"), headers=headers)
        seq_id = create.json()["id"]

        resp = client.post("/api/v1/sequences/executions", json={"sequence_id": seq_id}, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["current_step_id"] == "s1"
        assert data["status"] == "running"

    def test_advance_execution(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        seq_id = client.post("/api/v1/sequences", json=self._sample_payload("endpoint_adv"), headers=headers).json()["id"]
        exec_id = client.post("/api/v1/sequences/executions", json={"sequence_id": seq_id}, headers=headers).json()["id"]

        resp = client.post(
            f"/api/v1/sequences/executions/{exec_id}/advance", json={"event": "email_opened"}, headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["transition_triggered"] == "email_opened"
        assert data["current_step"] == "s2"

    def test_get_execution(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        seq_id = client.post("/api/v1/sequences", json=self._sample_payload("endpoint_get"), headers=headers).json()["id"]
        exec_id = client.post("/api/v1/sequences/executions", json={"sequence_id": seq_id}, headers=headers).json()["id"]

        resp = client.get(f"/api/v1/sequences/executions/{exec_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == exec_id
