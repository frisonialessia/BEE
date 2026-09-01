"""Tests for the Deep Learning & Intuition layer.

Covers:
* DiffEngine — diff op computation and rule extraction
* PromptAdjustmentEngine — rule merging, EMA update, style summary generation
* CorrectionLearningService — full correction pipeline, profile accumulation
* ScenarioSimulator — projections, modifiers, audit logging
* AnomalyDetector — detection, severity classification, auto-resolution, CEO alert
* API endpoints: /learning/corrections, /analytics/scenarios, /analytics/anomalies
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.anomaly import AlertSeverity, AlertStatus, AnomalyAlert
from app.models.base import UserRole
from app.models.correction import StyleRuleType
from app.models.organization import Organization
from app.models.user import User
from app.schemas.scenario import ScenarioRequest
from app.services.anomaly_detector import AnomalyDetector
from app.services.correction_learning import CorrectionLearningService
from app.services.correction_learning.diff_engine import (
    compute_change_ratio,
    compute_diff_ops,
    extract_rules_from_ops,
)
from app.services.correction_learning.prompt_adjuster import (
    count_authoritative_rules,
    generate_style_summary,
    merge_rules_into_profile,
)
from app.services.scenario_simulator import ScenarioSimulator

# ══════════════════════════════════════════════════════════════════
# DiffEngine
# ══════════════════════════════════════════════════════════════════


class TestDiffEngine:
    def test_detects_social_opener_removal(self) -> None:
        original = "Hope you're well! I wanted to reach out about BEE."
        edited = "BEE can reduce your CAC by 23% in 90 days."
        ops = compute_diff_ops(original, edited)
        types = [op["type"] for op in ops]
        assert "delete" in types
        assert any("social" in op.get("content", "") for op in ops if op["type"] == "delete")

    def test_detects_shortening(self) -> None:
        original = " ".join(["word"] * 100)
        edited = " ".join(["word"] * 30)
        ops = compute_diff_ops(original, edited)
        assert any(op["type"] == "shorten" for op in ops)

    def test_detects_expansion(self) -> None:
        original = "Short text."
        edited = " ".join(["expanded word"] * 60)
        ops = compute_diff_ops(original, edited)
        assert any(op["type"] == "expand" for op in ops)

    def test_detects_data_addition(self) -> None:
        original = "We help companies grow their sales."
        edited = "We help companies grow their sales. Our clients see a 35% revenue increase within 60 days."
        ops = compute_diff_ops(original, edited)
        assert any(op.get("content") == "data_evidence" for op in ops)

    def test_detects_bullet_formatting(self) -> None:
        original = "We offer feature A and feature B and feature C."
        edited = "Our features:\n- Feature A\n- Feature B\n- Feature C"
        ops = compute_diff_ops(original, edited)
        assert any(op.get("content") == "format_bullets" for op in ops)

    def test_unchanged_content_is_keep(self) -> None:
        text = "Exactly the same content."
        ops = compute_diff_ops(text, text)
        assert any(op["type"] == "keep" for op in ops)

    def test_filler_removal_detected(self) -> None:
        original = "Just wanted to reach out. Please don't hesitate to contact me. Kind regards."
        edited = "Let's talk about how we can help."
        ops = compute_diff_ops(original, edited)
        assert any(op.get("content") == "filler_phrases" for op in ops)

    def test_generic_claims_removal(self) -> None:
        original = "We are industry-leading and world-class with cutting-edge technology."
        edited = "Our clients achieve 40% reduction in churn."
        ops = compute_diff_ops(original, edited)
        assert any(op.get("content") == "generic_claims" for op in ops)

    def test_change_ratio_no_change(self) -> None:
        text = "Hello world"
        ratio = compute_change_ratio(text, text)
        assert ratio == 0.0

    def test_change_ratio_full_rewrite(self) -> None:
        original = "alpha beta gamma delta"
        edited = "totally different words here"
        ratio = compute_change_ratio(original, edited)
        assert ratio > 0.5

    def test_change_ratio_empty_original(self) -> None:
        ratio = compute_change_ratio("", "some content")
        assert ratio == 0.0


class TestRuleExtraction:
    def test_social_opener_removal_generates_rule(self) -> None:
        ops = [{"type": "delete", "content": "social_opener", "detail": ""}]
        rules = extract_rules_from_ops(ops, "email_draft")
        assert StyleRuleType.AVOID_SOCIAL_OPENER in rules
        assert StyleRuleType.PREFER_DIRECT_OPENER in rules

    def test_shortening_generates_concise_rule(self) -> None:
        ops = [{"type": "shorten", "content": "", "detail": "", "ratio": 0.40}]
        rules = extract_rules_from_ops(ops, "email_draft")
        assert StyleRuleType.PREFER_CONCISE in rules
        assert StyleRuleType.PREFER_SHORT_PARAGRAPHS in rules

    def test_bullet_format_generates_rule(self) -> None:
        ops = [{"type": "rewrite", "content": "format_bullets", "detail": ""}]
        rules = extract_rules_from_ops(ops, "email_draft")
        assert StyleRuleType.PREFER_BULLET_POINTS in rules

    def test_data_addition_generates_rule(self) -> None:
        ops = [{"type": "expand", "content": "data_evidence", "detail": ""}]
        rules = extract_rules_from_ops(ops, "email_draft")
        assert StyleRuleType.PREFER_DATA_EVIDENCE in rules

    def test_no_duplicate_rules(self) -> None:
        ops = [
            {"type": "delete", "content": "social_opener", "detail": ""},
            {"type": "delete", "content": "social_opener", "detail": ""},
        ]
        rules = extract_rules_from_ops(ops, "email_draft")
        assert rules.count(StyleRuleType.AVOID_SOCIAL_OPENER) == 1


# ══════════════════════════════════════════════════════════════════
# PromptAdjustmentEngine
# ══════════════════════════════════════════════════════════════════


class TestPromptAdjuster:
    def test_new_rule_added_with_initial_weight(self) -> None:
        rules = {}
        updated = merge_rules_into_profile(
            rules, "email_draft", [StyleRuleType.AVOID_SOCIAL_OPENER]
        )
        assert "email_draft" in updated
        assert StyleRuleType.AVOID_SOCIAL_OPENER in updated["email_draft"]
        assert updated["email_draft"][StyleRuleType.AVOID_SOCIAL_OPENER]["weight"] > 0

    def test_repeated_rule_increases_weight(self) -> None:
        rules = {}
        for _ in range(5):
            rules = merge_rules_into_profile(rules, "email_draft", [StyleRuleType.PREFER_CONCISE])
        weight = rules["email_draft"][StyleRuleType.PREFER_CONCISE]["weight"]
        count = rules["email_draft"][StyleRuleType.PREFER_CONCISE]["count"]
        assert count == 5
        assert weight > 0.55

    def test_style_summary_generated_after_enough_rules(self) -> None:
        rules = {}
        for _ in range(4):
            rules = merge_rules_into_profile(
                rules, "email_draft", [StyleRuleType.AVOID_SOCIAL_OPENER]
            )
        summary = generate_style_summary(rules)
        assert "CEO WRITING STYLE" in summary
        assert "social" in summary.lower()

    def test_empty_profile_generates_empty_summary(self) -> None:
        summary = generate_style_summary({})
        assert summary == ""

    def test_count_authoritative_rules_zero_when_new(self) -> None:
        rules = merge_rules_into_profile({}, "email_draft", [StyleRuleType.PREFER_DATA_EVIDENCE])
        count = count_authoritative_rules(rules)
        assert count == 0  # Single occurrence, not yet authoritative

    def test_count_authoritative_grows_with_confirmations(self) -> None:
        rules = {}
        for _ in range(8):  # Many confirmations to push weight above 0.80
            rules = merge_rules_into_profile(rules, "email_draft", [StyleRuleType.PREFER_CONCISE])
        count = count_authoritative_rules(rules)
        assert count >= 1


# ══════════════════════════════════════════════════════════════════
# CorrectionLearningService
# ══════════════════════════════════════════════════════════════════


class TestCorrectionLearningService:
    def test_record_correction_creates_correction_and_updates_profile(
        self, session: Session
    ) -> None:
        service = CorrectionLearningService(session)
        result = service.record_correction(
            original_content="Hope you're well! We are industry-leading and want to connect.",
            edited_content="Your CAC is 40% above industry median. Here's how we fix it.",
            artifact_type="email_draft",
        )
        session.commit()

        assert result.correction_id is not None
        assert result.total_corrections == 1
        assert result.profile_version == 2  # incremented from 1 (creation) to 2 (first update)

    def test_style_summary_updated_after_correction(self, session: Session) -> None:
        service = CorrectionLearningService(session)
        service.record_correction(
            original_content="Hope you're well! Let me tell you about our world-class solution.",
            edited_content="Revenue impact: direct. Your Q3 churn rate of 18% signals a product-fit issue.",
            artifact_type="email_draft",
        )
        session.commit()

        profile = service.get_style_profile()
        assert profile.total_corrections == 1

    def test_multiple_corrections_accumulate_rules(self, session: Session) -> None:
        service = CorrectionLearningService(session)
        for i in range(3):
            service.record_correction(
                original_content=f"Hope you're doing well {i}! Let me tell you about our revolutionary product.",
                edited_content=f"Your competitor just closed $5M in funding {i}. We help you respond.",
                artifact_type="email_draft",
            )
        session.commit()

        profile = service.get_style_profile()
        assert profile.total_corrections == 3
        assert "email_draft" in profile.rules_by_type

    def test_correction_without_changes_records_keep(self, session: Session) -> None:
        service = CorrectionLearningService(session)
        text = "This is a perfectly written email. No changes needed."
        result = service.record_correction(
            original_content=text,
            edited_content=text,
            artifact_type="email_draft",
        )
        session.commit()
        assert result.change_ratio == 0.0

    def test_correction_with_opportunity_id(self, session: Session) -> None:
        opp_id = uuid.uuid4()
        service = CorrectionLearningService(session)
        result = service.record_correction(
            original_content="Hello, hope this finds you well.",
            edited_content="Revenue alert: your CAC spiked 22% last quarter.",
            artifact_type="email_draft",
            opportunity_id=opp_id,
        )
        session.commit()
        assert result.correction_id is not None

    def test_get_style_summary_returns_empty_before_corrections(self, session: Session) -> None:
        service = CorrectionLearningService(session)
        summary = service.get_style_summary_for_injection()
        assert summary == ""

    def test_list_corrections_empty_initially(self, session: Session) -> None:
        service = CorrectionLearningService(session)
        corrections = service.list_corrections()
        assert corrections == []

    def test_list_corrections_returns_recorded(self, session: Session) -> None:
        service = CorrectionLearningService(session)
        service.record_correction("original", "edited", "email_draft")
        session.commit()
        corrections = service.list_corrections()
        assert len(corrections) >= 1

    def test_profile_version_increments_with_each_correction(self, session: Session) -> None:
        service = CorrectionLearningService(session)
        r1 = service.record_correction("orig1", "edit1", "email_draft")
        session.commit()
        r2 = service.record_correction("orig2", "edit2", "email_draft")
        session.commit()
        assert r2.profile_version > r1.profile_version


# ══════════════════════════════════════════════════════════════════
# ScenarioSimulator
# ══════════════════════════════════════════════════════════════════


class TestScenarioSimulator:
    def test_basic_simulation_returns_three_variants(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result = simulator.run(
            ScenarioRequest(
                sector="fintech",
                signal_type="funding_round",
                channel="email",
                target_monthly_signals=10,
            )
        )
        assert result.conservative.label == "conservative"
        assert result.realistic.label == "realistic"
        assert result.optimistic.label == "optimistic"

    def test_conservative_always_lower_than_realistic(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result = simulator.run(ScenarioRequest(target_monthly_signals=10))
        assert result.conservative.annual_revenue < result.realistic.annual_revenue

    def test_realistic_always_lower_than_optimistic(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result = simulator.run(ScenarioRequest(target_monthly_signals=10))
        assert result.realistic.annual_revenue < result.optimistic.annual_revenue

    def test_warm_intro_channel_lifts_win_rate(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result_email = simulator.run(ScenarioRequest(target_monthly_signals=10, channel="email"))
        result_warm = simulator.run(
            ScenarioRequest(target_monthly_signals=10, channel="warm_intro")
        )
        # warm_intro should have higher effective win rate
        assert result_warm.effective_win_rate >= result_email.effective_win_rate

    def test_dark_funnel_heat_lifts_win_rate(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result_cold = simulator.run(ScenarioRequest(target_monthly_signals=10, dark_funnel_heat=10))
        result_hot = simulator.run(ScenarioRequest(target_monthly_signals=10, dark_funnel_heat=75))
        assert result_hot.effective_win_rate >= result_cold.effective_win_rate

    def test_c_style_lifts_win_rate_highest(self, session: Session) -> None:  # noqa: ARG002
        from app.services.scenario_simulator.service import DISC_STYLE_MODIFIERS

        # C-style has highest modifier in our config
        assert DISC_STYLE_MODIFIERS["C"] >= DISC_STYLE_MODIFIERS["D"]

    def test_low_data_confidence_when_no_history(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result = simulator.run(
            ScenarioRequest(
                sector="extremely_rare_sector_xyz",
                target_monthly_signals=5,
            )
        )
        assert result.low_data_confidence is True
        # Zero StrategyOutcome rows anywhere for this org — the win_rate/
        # avg_deal_value/projections above are entirely industry-benchmark
        # defaults (_BASE_DEAL_VALUE_DEFAULT, the 0.25 fallback rate), not
        # anything measured from this tenant's own pipeline. This must be
        # surfaced distinctly from the generic low-sample-size case so the
        # frontend can label the numbers as estimates, not a forecast.
        assert result.has_any_historical_data is False
        assert any("Sin historial" in risk for risk in result.risk_factors)

    def test_has_any_historical_data_true_with_real_outcomes(self, session: Session) -> None:
        """A sparse-but-real sector still gets has_any_historical_data=True
        as long as this org has closed at least one deal anywhere — only a
        fully empty org falls back to pure industry-benchmark constants."""
        import uuid

        from app.models.strategy_outcome import StrategyOutcome

        session.add(
            StrategyOutcome(
                opportunity_id=uuid.uuid4(),
                signal_type="hiring_surge",
                company_industry="logistics",
                outcome="won",
                deal_value=50_000.0,
                cycle_days=30,
                playbook="p",
                channel="email",
                generator="g",
                generator_version="1.0.0",
            )
        )
        session.commit()

        simulator = ScenarioSimulator(session)
        result = simulator.run(
            ScenarioRequest(sector="a_totally_different_sector", target_monthly_signals=5)
        )
        assert result.has_any_historical_data is True

    def test_additional_reps_increases_signal_volume(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result_no_reps = simulator.run(
            ScenarioRequest(target_monthly_signals=10, additional_prospecting_reps=0)
        )
        result_with_reps = simulator.run(
            ScenarioRequest(target_monthly_signals=10, additional_prospecting_reps=3)
        )
        assert result_with_reps.adjusted_monthly_signals > result_no_reps.adjusted_monthly_signals

    def test_key_drivers_returned(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result = simulator.run(
            ScenarioRequest(
                target_monthly_signals=10,
                channel="warm_intro",
                dark_funnel_heat=70,
            )
        )
        assert len(result.key_drivers) >= 1

    def test_risk_factors_returned_for_low_data(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result = simulator.run(
            ScenarioRequest(
                sector="ultra_rare_sector",
                target_monthly_signals=10,
            )
        )
        assert len(result.risk_factors) >= 1

    def test_recommended_actions_returned(self, session: Session) -> None:
        simulator = ScenarioSimulator(session)
        result = simulator.run(ScenarioRequest(target_monthly_signals=10))
        assert len(result.recommended_actions) >= 1

    def test_scenario_with_historical_data(self, session: Session) -> None:
        """Test with actual StrategyOutcome records for a sector."""
        from app.models.strategy_outcome import StrategyOutcome

        for i in range(6):
            outcome = StrategyOutcome(
                opportunity_id=uuid.uuid4(),
                outcome="won" if i < 4 else "lost",
                signal_type="funding_round",
                company_industry="testco_industry",
                industry="testco_industry",
                playbook="funding_play",
                channel="email",
                generator="default",
                generator_version="1.0",
                deal_value=40000.0,
                cycle_days=45,
            )
            session.add(outcome)
        session.commit()

        simulator = ScenarioSimulator(session)
        result = simulator.run(
            ScenarioRequest(
                sector="testco_industry",
                signal_type="funding_round",
                target_monthly_signals=10,
            )
        )
        assert result.historical_sample_size >= 6
        assert result.base_win_rate > 0
        assert result.low_data_confidence is False


# ══════════════════════════════════════════════════════════════════
# AnomalyDetector
# ══════════════════════════════════════════════════════════════════


def _make_outcomes(
    session: Session, win_count: int, total: int, channel: str = "email", sector: str = "saas"
) -> None:
    """Helper to create StrategyOutcome records."""
    from app.models.strategy_outcome import StrategyOutcome

    for i in range(total):
        outcome = StrategyOutcome(
            opportunity_id=uuid.uuid4(),
            outcome="won" if i < win_count else "lost",
            signal_type="hiring",
            company_industry=sector,
            industry=sector,
            playbook="hiring_play",
            channel=channel,
            generator="default",
            generator_version="1.0",
        )
        session.add(outcome)
    session.flush()


class TestAnomalyDetector:
    def test_insufficient_data_returns_empty_alerts(self, session: Session) -> None:
        detector = AnomalyDetector(session)
        result = detector.check_all()
        session.commit()
        assert result.new_alerts == []
        assert "Insufficient" in result.summary or "no anomalies" in result.summary.lower()

    def test_stable_win_rate_no_alerts(self, session: Session) -> None:
        from app.models.strategy_outcome import StrategyOutcome

        # Interleave wins and losses so both rolling and baseline show ~50% win rate
        for i in range(20):
            outcome = StrategyOutcome(
                opportunity_id=uuid.uuid4(),
                outcome="won" if i % 2 == 0 else "lost",
                signal_type="hiring",
                company_industry="stable_sector",
                industry="stable_sector",
                playbook="play",
                channel="stable_channel",
                generator="default",
                generator_version="1.0",
            )
            session.add(outcome)
        session.commit()

        detector = AnomalyDetector(session)
        result = detector.check_all()
        session.commit()
        # With consistent 50% win rate in both rolling and baseline, no anomaly expected
        assert len(result.new_alerts) == 0

    def test_significant_drop_creates_alert(self, session: Session) -> None:
        from app.models.strategy_outcome import StrategyOutcome

        # Create a strong baseline: 70% win rate on old outcomes
        for i in range(30):
            outcome = StrategyOutcome(
                opportunity_id=uuid.uuid4(),
                outcome="won" if i < 21 else "lost",
                signal_type="hiring",
                company_industry="anomaly_test_sector",
                industry="anomaly_test_sector",
                playbook="hiring_play",
                channel="email_anomaly",
                generator="default",
                generator_version="1.0",
            )
            session.add(outcome)

        # Then create a bad recent run: 10% win rate (severe drop)
        for i in range(10):
            outcome = StrategyOutcome(
                opportunity_id=uuid.uuid4(),
                outcome="won" if i == 0 else "lost",
                signal_type="hiring",
                company_industry="anomaly_test_sector",
                industry="anomaly_test_sector",
                playbook="hiring_play",
                channel="email_anomaly",
                generator="default",
                generator_version="1.0",
            )
            session.add(outcome)
        session.commit()

        detector = AnomalyDetector(session)
        result = detector.check_all()
        session.commit()
        # Should detect the overall conversion drop
        assert len(result.new_alerts) >= 1

    def test_alert_severity_classification(self) -> None:
        from app.services.anomaly_detector.service import _classify_severity

        assert _classify_severity(-0.55) == AlertSeverity.CRITICAL
        assert _classify_severity(-0.40) == AlertSeverity.HIGH
        assert _classify_severity(-0.25) == AlertSeverity.MEDIUM
        assert _classify_severity(-0.12) == AlertSeverity.LOW

    def test_acknowledge_alert(self, session: Session) -> None:
        alert = AnomalyAlert(
            alert_type="conversion_drop",
            severity=AlertSeverity.MEDIUM,
            status=AlertStatus.OPEN,
            segment_type="overall",
            rolling_rate=0.15,
            baseline_rate=0.30,
            deviation_pct=-50.0,
            sample_size=10,
            baseline_sample_size=20,
            title="Test alert",
            description="Test",
            recommendation="review",
            suggested_actions=["Action 1"],
        )
        session.add(alert)
        session.flush()

        detector = AnomalyDetector(session)
        acknowledged = detector.acknowledge_alert(alert.id, notes="Seasonal dip expected")
        session.commit()
        assert acknowledged is not None
        assert acknowledged.status == AlertStatus.ACKNOWLEDGED
        assert "Seasonal" in acknowledged.resolution_notes

    def test_acknowledge_nonexistent_alert_returns_none(self, session: Session) -> None:
        detector = AnomalyDetector(session)
        result = detector.acknowledge_alert(uuid.uuid4())
        assert result is None

    def test_list_alerts_by_status(self, session: Session) -> None:
        alert = AnomalyAlert(
            alert_type="conversion_drop",
            severity=AlertSeverity.LOW,
            status=AlertStatus.OPEN,
            segment_type="overall",
            rolling_rate=0.20,
            baseline_rate=0.25,
            deviation_pct=-20.0,
            sample_size=10,
            baseline_sample_size=20,
            title="Listed alert",
            description="Test",
            recommendation="monitor",
            suggested_actions=[],
        )
        session.add(alert)
        session.flush()
        session.commit()

        detector = AnomalyDetector(session)
        open_alerts = detector.list_alerts(status=AlertStatus.OPEN)
        assert any(a.id == alert.id for a in open_alerts)

    def test_no_duplicate_alerts_for_same_segment(self, session: Session) -> None:
        """Running check_all twice should not create duplicate alerts."""
        from app.models.strategy_outcome import StrategyOutcome

        for i in range(30):
            outcome = StrategyOutcome(
                opportunity_id=uuid.uuid4(),
                outcome="won" if i < 21 else "lost",
                signal_type="hiring",
                company_industry="dedup_sector",
                industry="dedup_sector",
                playbook="play",
                channel="dedup_channel",
                generator="default",
                generator_version="1.0",
            )
            session.add(outcome)
        for i in range(10):
            outcome = StrategyOutcome(
                opportunity_id=uuid.uuid4(),
                outcome="won" if i == 0 else "lost",
                signal_type="hiring",
                company_industry="dedup_sector",
                industry="dedup_sector",
                playbook="play",
                channel="dedup_channel",
                generator="default",
                generator_version="1.0",
            )
            session.add(outcome)
        session.commit()

        detector = AnomalyDetector(session)
        detector.check_all()
        session.commit()
        result2 = detector.check_all()
        session.commit()

        # The key property: no duplicate alerts created for already-open segments
        open_overall = [a for a in result2.open_alerts if a.segment_type == "overall"]
        assert len(open_overall) <= 1


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


class TestCorrectionEndpoints:
    def test_record_correction(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/learning/corrections",
            json={
                "original_content": "Hope you're well! We are industry-leading.",
                "edited_content": "Your CAC is 40% above median. Let's fix it.",
                "artifact_type": "email_draft",
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "correction_id" in data
        assert "extracted_rules" in data
        assert data["total_corrections"] >= 1

    def test_record_correction_requires_auth(self, client) -> None:
        resp = client.post(
            "/api/v1/learning/corrections",
            json={
                "original_content": "Hope you're well!",
                "edited_content": "Anonymous submission.",
                "artifact_type": "email_draft",
            },
        )
        assert resp.status_code == 401

    def test_get_style_profile(self, client) -> None:
        resp = client.get("/api/v1/learning/style-profile")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_corrections" in data
        assert "style_summary" in data

    def test_list_corrections_empty_initially(self, client) -> None:
        resp = client.get("/api/v1/learning/corrections")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_style_profile_updates_after_correction(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        client.post(
            "/api/v1/learning/corrections",
            json={
                "original_content": "Hope this finds you well!",
                "edited_content": "40% of your pipeline is stalled. Here's why.",
                "artifact_type": "email_draft",
            },
            headers=headers,
        )
        # Same headers on the read: the correction was recorded under this
        # specific org, and an unscoped GET now legitimately reads a
        # different (empty) profile — that's the org-scoping working
        # correctly, not a bug this test is about.
        resp = client.get("/api/v1/learning/style-profile", headers=headers)
        data = resp.json()
        assert data["total_corrections"] >= 1


class TestScenarioEndpoints:
    def test_run_scenario_basic(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/analytics/scenarios",
            json={
                "sector": "fintech",
                "signal_type": "funding_round",
                "channel": "email",
                "target_monthly_signals": 15,
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "conservative" in data
        assert "realistic" in data
        assert "optimistic" in data
        assert "key_drivers" in data
        assert "risk_factors" in data

    def test_run_scenario_requires_auth(self, client) -> None:
        resp = client.post("/api/v1/analytics/scenarios", json={"target_monthly_signals": 10})
        assert resp.status_code == 401

    def test_scenario_with_warm_intro(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/analytics/scenarios",
            json={
                "channel": "warm_intro",
                "target_monthly_signals": 10,
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["channel_modifier"] == 1.45

    def test_scenario_projections_ordered(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/analytics/scenarios",
            json={
                "target_monthly_signals": 10,
            },
            headers=_auth_headers(session),
        )
        data = resp.json()
        assert data["conservative"]["annual_revenue"] < data["realistic"]["annual_revenue"]
        assert data["realistic"]["annual_revenue"] < data["optimistic"]["annual_revenue"]

    def test_scenario_low_data_confidence_flagged(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/analytics/scenarios",
            json={
                "sector": "nonexistent_sector_9999",
                "target_monthly_signals": 5,
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        assert resp.json()["low_data_confidence"] is True


class TestAnomalyEndpoints:
    def test_check_anomalies_empty_db(self, client, session: Session) -> None:
        resp = client.post("/api/v1/analytics/anomalies/check", headers=_auth_headers(session))
        assert resp.status_code == 200
        data = resp.json()
        assert "checked_at" in data
        assert "summary" in data
        assert isinstance(data["new_alerts"], list)

    def test_check_anomalies_requires_auth(self, client) -> None:
        resp = client.post("/api/v1/analytics/anomalies/check")
        assert resp.status_code == 401

    def test_list_anomalies(self, client) -> None:
        resp = client.get("/api/v1/analytics/anomalies")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_acknowledge_nonexistent_alert(self, client, session: Session) -> None:
        resp = client.post(
            f"/api/v1/analytics/anomalies/{uuid.uuid4()}/acknowledge",
            json={},
            headers=_auth_headers(session),
        )
        assert resp.status_code == 404

    def test_anomaly_check_and_acknowledge_flow(self, client, session: Session) -> None:
        from app.models.anomaly import AnomalyAlert

        # Create an open alert directly
        alert = AnomalyAlert(
            alert_type="conversion_drop",
            severity=AlertSeverity.MEDIUM,
            status=AlertStatus.OPEN,
            segment_type="overall",
            rolling_rate=0.15,
            baseline_rate=0.30,
            deviation_pct=-50.0,
            sample_size=10,
            baseline_sample_size=20,
            title="API test alert",
            description="Test",
            recommendation="review",
            suggested_actions=["Review strategy"],
        )
        session.add(alert)
        session.commit()

        # Acknowledge via API
        resp = client.post(
            f"/api/v1/analytics/anomalies/{alert.id}/acknowledge",
            json={"notes": "Expected seasonal dip"},
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "acknowledged"

    def test_list_by_severity(self, client, session: Session) -> None:
        from app.models.anomaly import AnomalyAlert

        alert = AnomalyAlert(
            alert_type="conversion_drop",
            severity=AlertSeverity.CRITICAL,
            status=AlertStatus.OPEN,
            segment_type="overall",
            rolling_rate=0.05,
            baseline_rate=0.30,
            deviation_pct=-83.0,
            sample_size=10,
            baseline_sample_size=20,
            title="Critical alert",
            description="Critical drop",
            recommendation="immediate_review",
            suggested_actions=["Pause immediately"],
        )
        session.add(alert)
        session.commit()

        resp = client.get("/api/v1/analytics/anomalies?severity=critical")
        assert resp.status_code == 200
        data = resp.json()
        assert all(a["severity"] == "critical" for a in data)
