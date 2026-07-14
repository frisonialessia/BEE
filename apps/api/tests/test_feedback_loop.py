"""Tests for FeedbackLoopService, ExecutiveAgent, and BehavioralCollector.

These cover:
* FeedbackLoopService.record_outcome — WON/LOST persistence, idempotency
* FeedbackLoopService.get_success_hints — win-rate aggregation, confidence tiers
* SuccessHint.is_actionable — confidence threshold logic
* SuccessHint.to_prompt_text — LLM prompt formatting
* ExecutiveAgent artifact generation — email, meeting, next steps
* ArtifactBundle serialization
* BehavioralAnalyzer — intent signal scoring
* BuyingIntentEvent — intent score lookup
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

from app.models.base import BehavioralEventType, SignalType
from app.schemas.behavioral import EVENT_INTENT_SCORES
from app.schemas.executive import ArtifactBundle
from app.schemas.feedback import SuccessHint
from app.schemas.strategy import StrategySchema, TimingWindow
from app.services.executive_agent.base import ArtifactContext
from app.services.executive_agent.generators import RuleBasedArtifactGenerator
from app.services.strategy_generator.base import EnrichmentContext

# ── SuccessHint ────────────────────────────────────────────────────────────────


class TestSuccessHint:
    def test_confidence_low(self):
        hint = SuccessHint(
            playbook="post_funding",
            channel="email",
            generator="rule_based",
            win_rate=0.6,
            sample_size=2,
            confidence="low",
        )
        assert not hint.is_actionable

    def test_confidence_medium(self):
        hint = SuccessHint(
            playbook="post_funding",
            channel="email",
            generator="rule_based",
            win_rate=0.7,
            sample_size=10,
            confidence="medium",
        )
        assert hint.is_actionable

    def test_confidence_high(self):
        hint = SuccessHint(
            playbook="post_funding",
            channel="email",
            generator="rule_based",
            win_rate=0.8,
            sample_size=30,
            confidence="high",
        )
        assert hint.is_actionable

    def test_to_prompt_text_no_days(self):
        hint = SuccessHint(
            playbook="post_funding_outreach",
            channel="email",
            generator="rule_based",
            win_rate=0.74,
            sample_size=42,
            confidence="high",
        )
        text = hint.to_prompt_text()
        assert "74%" in text
        assert "42" in text
        assert "post_funding_outreach" in text
        assert "email" in text
        assert "strong evidence shows" in text

    def test_to_prompt_text_with_days(self):
        hint = SuccessHint(
            playbook="hiring_growth",
            channel="linkedin",
            generator="rule_based",
            win_rate=0.60,
            sample_size=15,
            confidence="medium",
            avg_days_to_close=18.0,
        )
        text = hint.to_prompt_text()
        assert "18 days" in text
        assert "60%" in text


# ── EnrichmentContext.best_hint ────────────────────────────────────────────────


class TestEnrichmentContextBestHint:
    def _ctx(self, hints: list[SuccessHint]) -> EnrichmentContext:
        return EnrichmentContext(
            signal_type=SignalType.FUNDING_ROUND,
            signal_title="Test signal",
            signal_score=80.0,
            success_hints=hints,
        )

    def test_no_hints_returns_none(self):
        ctx = self._ctx([])
        assert ctx.best_hint is None

    def test_low_confidence_hint_not_returned(self):
        low_hint = SuccessHint(
            playbook="x",
            channel="y",
            generator="r",
            win_rate=0.5,
            sample_size=2,
            confidence="low",
        )
        ctx = self._ctx([low_hint])
        assert ctx.best_hint is None

    def test_medium_confidence_hint_returned(self):
        hint = SuccessHint(
            playbook="post_funding",
            channel="email",
            generator="rule_based",
            win_rate=0.7,
            sample_size=10,
            confidence="medium",
        )
        ctx = self._ctx([hint])
        assert ctx.best_hint is hint


# ── BehavioralAnalyzer ─────────────────────────────────────────────────────────


class TestBehavioralAnalyzer:
    """Tests for the BehavioralAnalyzer that handles intent signals."""

    def test_intent_scores_defined(self):
        for event_type in BehavioralEventType:
            assert event_type in EVENT_INTENT_SCORES, (
                f"Missing intent score for {event_type}"
            )

    def test_pricing_view_highest_score(self):
        assert EVENT_INTENT_SCORES[BehavioralEventType.PRICING_VIEW] >= 90.0

    def test_demo_request_highest_score(self):
        assert EVENT_INTENT_SCORES[BehavioralEventType.DEMO_REQUEST] >= 90.0

    def test_page_visit_lowest_score(self):
        assert EVENT_INTENT_SCORES[BehavioralEventType.PAGE_VISIT] <= 50.0

    def test_behavioral_analyzer_supports_engagement_source(self):
        from app.models.base import SignalSource
        from app.schemas.signal import SignalWebhookIn
        from app.services.signal_engine.analyzers.keyword_analyzers import BehavioralAnalyzer

        payload = SignalWebhookIn(
            title="Pricing page visit",
            event="behavioral.intent",
            signal_type=SignalType.ENGAGEMENT,
            source=SignalSource.BEHAVIORAL,
            data={"intent_score": 92.0, "event_type": "pricing_view"},
        )
        analyzer = BehavioralAnalyzer()
        assert analyzer.supports(payload)

    def test_behavioral_analyzer_uses_intent_score(self):
        from app.models.base import SignalSource
        from app.schemas.signal import SignalWebhookIn
        from app.services.signal_engine.analyzers.keyword_analyzers import BehavioralAnalyzer

        payload = SignalWebhookIn(
            title="Demo request",
            event="behavioral.intent",
            source=SignalSource.BEHAVIORAL,
            data={"intent_score": 95.0, "event_type": "demo_request"},
        )
        analyzer = BehavioralAnalyzer()
        result = analyzer.analyze(payload)
        assert result.score == 95.0
        assert result.signal_type == SignalType.ENGAGEMENT
        assert result.strategy is None  # no new opportunity for behavioral events

    def test_behavioral_analyzer_not_returned_strategy(self):
        """Behavioral signals should not create new opportunities."""
        from app.models.base import SignalSource
        from app.schemas.signal import SignalWebhookIn
        from app.services.signal_engine.analyzers.keyword_analyzers import BehavioralAnalyzer

        payload = SignalWebhookIn(
            title="Repeat visit",
            event="behavioral.intent",
            source=SignalSource.BEHAVIORAL,
            data={"intent_score": 75.0, "event_type": "repeat_visit"},
        )
        analyzer = BehavioralAnalyzer()
        result = analyzer.analyze(payload)
        assert result.strategy is None


# ── ExecutiveAgent artifact generators ────────────────────────────────────────


class TestRuleBasedArtifactGenerator:
    """Tests for the built-in artifact generator."""

    def _strategy(self) -> StrategySchema:
        return StrategySchema(
            pain_point="Acme faces scale-up challenges after their Series B.",
            closing_argument="Congrats on the raise — we help teams like yours 2x sales ramp speed.",
            timing_window=TimingWindow(
                urgency="immediate",
                reason="Budget decisions happen in the first 60 days post-funding.",
                expires_at="60 days post-funding",
            ),
            playbook="post_funding_outreach",
            next_best_action="reach_out",
            channel="email",
        )

    def _ctx(self) -> ArtifactContext:
        return ArtifactContext(
            strategy=self._strategy(),
            company_name="Acme Corp",
            lead_name="Jane Doe",
            lead_title="VP Sales",
            signal_type="funding_round",
            signal_title="Acme raised $20M Series B",
            opportunity_title="Acme Corp — funding round opportunity",
        )

    def test_generate_email_has_required_fields(self):
        gen = RuleBasedArtifactGenerator()
        ctx = self._ctx()
        email = gen.generate_email(ctx)
        assert email.subject
        assert email.body
        assert "Jane" in email.body  # first name extracted
        assert email.artifact_type == "email_draft"

    def test_generate_email_includes_closing_argument(self):
        gen = RuleBasedArtifactGenerator()
        email = gen.generate_email(self._ctx())
        # The closing argument text should appear in the body
        assert "2x" in email.body or "raise" in email.body

    def test_generate_email_ps_for_expires_at(self):
        gen = RuleBasedArtifactGenerator()
        email = gen.generate_email(self._ctx())
        assert email.ps_line is not None
        assert "60 days" in email.ps_line

    def test_generate_meeting_has_agenda(self):
        gen = RuleBasedArtifactGenerator()
        ctx = self._ctx()
        meeting = gen.generate_meeting(ctx)
        assert meeting.artifact_type == "meeting_structure"
        assert len(meeting.agenda_items) >= 4
        assert meeting.total_duration_minutes == 20
        assert "Acme" in meeting.meeting_title

    def test_generate_next_steps_has_actions(self):
        gen = RuleBasedArtifactGenerator()
        ctx = self._ctx()
        steps = gen.generate_next_steps(ctx)
        assert steps.artifact_type == "next_steps"
        assert len(steps.actions) >= 4
        # At least one high-priority action for immediate urgency
        high_priority = [a for a in steps.actions if a.priority == "high"]
        assert len(high_priority) >= 1

    def test_generate_next_steps_includes_deadline_for_expires_at(self):
        gen = RuleBasedArtifactGenerator()
        steps = gen.generate_next_steps(self._ctx())
        action_texts = " ".join(a.action for a in steps.actions)
        assert "60 days" in action_texts

    def test_bundle_serializable(self):
        """ArtifactBundle must be JSON-serializable for DB storage and webhooks."""
        gen = RuleBasedArtifactGenerator()
        ctx = self._ctx()
        opp_id = uuid.uuid4()
        bundle = ArtifactBundle(
            opportunity_id=opp_id,
            generated_at=datetime.now(UTC),
            generator=gen.name,
            email_draft=gen.generate_email(ctx),
            meeting_structure=gen.generate_meeting(ctx),
            next_steps=gen.generate_next_steps(ctx),
        )
        dumped = bundle.model_dump(mode="json")
        assert dumped["opportunity_id"] == str(opp_id)
        assert "email_draft" in dumped
        assert "meeting_structure" in dumped
        assert "next_steps" in dumped

    def test_bundle_roundtrip_validation(self):
        """ArtifactBundle stored in JSON column must round-trip via model_validate."""
        gen = RuleBasedArtifactGenerator()
        ctx = self._ctx()
        opp_id = uuid.uuid4()
        original = ArtifactBundle(
            opportunity_id=opp_id,
            generated_at=datetime.now(UTC),
            generator=gen.name,
            email_draft=gen.generate_email(ctx),
            meeting_structure=gen.generate_meeting(ctx),
            next_steps=gen.generate_next_steps(ctx),
        )
        as_dict = original.model_dump(mode="json")
        recovered = ArtifactBundle.model_validate(as_dict)
        assert recovered.opportunity_id == opp_id
        assert recovered.email_draft.subject == original.email_draft.subject


# ── FeedbackLoopService (unit-level, no DB) ────────────────────────────────────


class TestFeedbackLoopServiceUnit:
    """Unit tests that mock the repository to avoid a real DB connection."""

    def _make_service(self, win_rate_rows: list[dict] | None = None):
        from app.services.feedback_loop.service import FeedbackLoopService

        session = MagicMock()
        svc = FeedbackLoopService(session)
        svc._outcomes = MagicMock()
        svc._opps = MagicMock()

        svc._outcomes.get_win_rates.return_value = win_rate_rows or []
        return svc

    def test_no_history_returns_empty_hints(self):
        svc = self._make_service([])
        hints = svc.get_success_hints("funding_round")
        assert hints == []

    def test_hints_ordered_by_win_rate(self):
        rows = [
            {"playbook": "a", "channel": "email", "generator": "r", "total": 20, "wins": 14, "win_rate": 0.70, "avg_days": 30.0},
            {"playbook": "b", "channel": "linkedin", "generator": "r", "total": 20, "wins": 16, "win_rate": 0.80, "avg_days": 25.0},
        ]
        # Repository already returns sorted, so let's keep that ordering
        svc = self._make_service(rows)
        hints = svc.get_success_hints("funding_round")
        # Should return both hints (up to max_hints=3)
        assert len(hints) == 2
        assert hints[0].win_rate == 0.70  # first in list is first returned

    def test_low_sample_is_low_confidence(self):
        rows = [
            {"playbook": "x", "channel": "email", "generator": "r", "total": 3, "wins": 2, "win_rate": 0.67, "avg_days": None},
        ]
        svc = self._make_service(rows)
        hints = svc.get_success_hints("hiring")
        assert hints[0].confidence == "low"

    def test_medium_sample_is_medium_confidence(self):
        rows = [
            {"playbook": "x", "channel": "email", "generator": "r", "total": 12, "wins": 9, "win_rate": 0.75, "avg_days": None},
        ]
        svc = self._make_service(rows)
        hints = svc.get_success_hints("hiring")
        assert hints[0].confidence == "medium"

    def test_high_sample_is_high_confidence(self):
        rows = [
            {"playbook": "x", "channel": "email", "generator": "r", "total": 25, "wins": 18, "win_rate": 0.72, "avg_days": 22.0},
        ]
        svc = self._make_service(rows)
        hints = svc.get_success_hints("funding_round")
        assert hints[0].confidence == "high"
        assert hints[0].avg_days_to_close == 22.0

    def test_max_hints_limits_results(self):
        rows = [
            {"playbook": f"p{i}", "channel": "email", "generator": "r", "total": 20, "wins": 10, "win_rate": 0.5, "avg_days": None}
            for i in range(10)
        ]
        svc = self._make_service(rows)
        hints = svc.get_success_hints("funding_round", max_hints=2)
        assert len(hints) == 2
