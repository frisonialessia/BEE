"""Tests for CyclePredictorService — predicted time-to-close for an open
opportunity, from this org's own comparable closed-deal history. See
app.services.cycle_predictor.service.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.base import OpportunityStatus, SignalSource, SignalType
from app.models.company import Company
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.services.cycle_predictor import CyclePredictorService


def _company(session: Session, *, org_id: uuid.UUID, industry: str = "SaaS") -> Company:
    c = Company(organization_id=org_id, name=f"Co {uuid.uuid4().hex[:6]}", industry=industry)
    session.add(c)
    session.flush()
    return c


def _signal(session: Session, *, org_id: uuid.UUID, signal_type: SignalType = SignalType.FUNDING_ROUND) -> Signal:
    s = Signal(
        organization_id=org_id,
        signal_type=signal_type,
        source=SignalSource.WEBHOOK,
        title="Test signal",
        score=80,
        confidence=0.8,
    )
    session.add(s)
    session.flush()
    return s


def _signal_at(
    session: Session, *, org_id: uuid.UUID, company_id: uuid.UUID, detected_at: datetime,
    signal_type: SignalType = SignalType.HIRING,
) -> Signal:
    """A signal on a specific company at a specific moment — used to plant a
    "new signal detected while the deal was open" event for the signal
    recalibration tests, independent of the signal that originated the
    opportunity itself."""
    s = Signal(
        organization_id=org_id,
        company_id=company_id,
        signal_type=signal_type,
        source=SignalSource.WEBHOOK,
        title="Intermediate signal",
        score=70,
        confidence=0.7,
        detected_at=detected_at,
    )
    session.add(s)
    session.flush()
    return s


def _closed_opportunity(
    session: Session,
    *,
    org_id: uuid.UUID,
    company: Company | None,
    signal: Signal | None,
    status: OpportunityStatus,
    created_days_ago: int,
    cycle_days: int,
) -> Opportunity:
    created_at = datetime.now(UTC) - timedelta(days=created_days_ago)
    closed_at = created_at + timedelta(days=cycle_days)
    o = Opportunity(
        organization_id=org_id,
        company_id=company.id if company else None,
        signal_id=signal.id if signal else None,
        title="Closed deal",
        status=status,
        created_at=created_at,
        closed_at=closed_at,
    )
    session.add(o)
    session.flush()
    return o


def _open_opportunity(
    session: Session,
    *,
    org_id: uuid.UUID,
    company: Company | None,
    signal: Signal | None,
    created_days_ago: int,
    status: OpportunityStatus = OpportunityStatus.IN_PROGRESS,
) -> Opportunity:
    o = Opportunity(
        organization_id=org_id,
        company_id=company.id if company else None,
        signal_id=signal.id if signal else None,
        title="Open deal",
        status=status,
        created_at=datetime.now(UTC) - timedelta(days=created_days_ago),
    )
    session.add(o)
    session.flush()
    return o


class TestNotEnoughData:
    def test_no_closed_deals_at_all(self, session: Session):
        org_id = uuid.uuid4()
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=10)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.available is False
        assert result.reason

    def test_fewer_than_three_closed_deals(self, session: Session):
        org_id = uuid.uuid4()
        company = _company(session, org_id=org_id)
        signal = _signal(session, org_id=org_id)
        _closed_opportunity(
            session, org_id=org_id, company=company, signal=signal,
            status=OpportunityStatus.WON, created_days_ago=60, cycle_days=20,
        )
        target = _open_opportunity(session, org_id=org_id, company=company, signal=signal, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, signal, company, org_id)
        assert result.available is False


class TestAlreadyClosed:
    def test_won_opportunity_has_nothing_to_predict(self, session: Session):
        org_id = uuid.uuid4()
        target = _closed_opportunity(
            session, org_id=org_id, company=None, signal=None,
            status=OpportunityStatus.WON, created_days_ago=30, cycle_days=15,
        )
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.available is False
        assert "cerrada" in result.reason.lower()


class TestCohortTiers:
    def test_predicts_from_signal_type_and_industry_match(self, session: Session):
        org_id = uuid.uuid4()
        company = _company(session, org_id=org_id, industry="Fintech")
        signal = _signal(session, org_id=org_id, signal_type=SignalType.HIRING)

        # 4 comparable closed deals, cycle lengths 20/24/28/32 → median 26.
        for days in (20, 24, 28, 32):
            _closed_opportunity(
                session, org_id=org_id, company=company, signal=signal,
                status=OpportunityStatus.WON, created_days_ago=100, cycle_days=days,
            )

        target = _open_opportunity(session, org_id=org_id, company=company, signal=signal, created_days_ago=10)
        session.commit()

        result = CyclePredictorService(session).predict(target, signal, company, org_id)
        assert result.available is True
        assert result.predicted_cycle_days == 26.0
        assert result.cohort_size == 4
        assert "tipo de señal e industria" in result.cohort_basis
        assert result.confidence == "low"  # cohort of 4: bare minimum above _MIN_COHORT, <5

    def test_falls_back_to_signal_type_only_when_industry_differs(self, session: Session):
        org_id = uuid.uuid4()
        signal = _signal(session, org_id=org_id, signal_type=SignalType.PRODUCT_LAUNCH)
        target_company = _company(session, org_id=org_id, industry="Retail")

        # 3 closed deals: same signal_type, but a DIFFERENT industry each —
        # tier 1 (signal_type + industry) can't reach 3, tier 2 (signal_type
        # alone) can.
        for i, days in enumerate((15, 18, 21)):
            other_company = _company(session, org_id=org_id, industry=f"Industry {i}")
            _closed_opportunity(
                session, org_id=org_id, company=other_company, signal=signal,
                status=OpportunityStatus.LOST, created_days_ago=80, cycle_days=days,
            )

        target = _open_opportunity(session, org_id=org_id, company=target_company, signal=signal, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, signal, target_company, org_id)
        assert result.available is True
        assert result.cohort_basis == "deals cerrados similares por tipo de señal"
        assert result.predicted_cycle_days == 18.0

    def test_falls_back_to_every_closed_deal_when_nothing_else_matches(self, session: Session):
        org_id = uuid.uuid4()
        # 3 closed deals with no signal/company at all.
        for days in (10, 40, 70):
            _closed_opportunity(
                session, org_id=org_id, company=None, signal=None,
                status=OpportunityStatus.WON, created_days_ago=90, cycle_days=days,
            )
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.available is True
        assert result.cohort_basis == "todos los deals cerrados de la cuenta"
        assert result.predicted_cycle_days == 40.0

    def test_confidence_is_high_with_ten_or_more_comparable_deals(self, session: Session):
        org_id = uuid.uuid4()
        for _ in range(10):
            _closed_opportunity(
                session, org_id=org_id, company=None, signal=None,
                status=OpportunityStatus.WON, created_days_ago=90, cycle_days=30,
            )
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.confidence == "high"


class TestPredictedDates:
    def test_days_remaining_and_close_date_are_computed_from_creation(self, session: Session):
        org_id = uuid.uuid4()
        for days in (30, 30, 30):
            _closed_opportunity(
                session, org_id=org_id, company=None, signal=None,
                status=OpportunityStatus.WON, created_days_ago=90, cycle_days=days,
            )
        # Created 10 days ago, predicted cycle 30 → 20 days remaining, not overdue.
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=10)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.predicted_cycle_days == 30.0
        assert result.days_elapsed == 10
        assert result.days_remaining == 20
        assert result.is_overdue is False

    def test_overdue_when_elapsed_exceeds_the_predicted_cycle(self, session: Session):
        org_id = uuid.uuid4()
        for days in (15, 15, 15):
            _closed_opportunity(
                session, org_id=org_id, company=None, signal=None,
                status=OpportunityStatus.WON, created_days_ago=90, cycle_days=days,
            )
        # Created 40 days ago, predicted cycle only 15 → well overdue.
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=40)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.is_overdue is True
        assert result.days_remaining < 0


class TestTenantIsolation:
    def test_another_organizations_closed_deals_are_not_used(self, session: Session):
        org_a = uuid.uuid4()
        org_b = uuid.uuid4()
        for days in (10, 10, 10):
            _closed_opportunity(
                session, org_id=org_b, company=None, signal=None,
                status=OpportunityStatus.WON, created_days_ago=90, cycle_days=days,
            )
        target = _open_opportunity(session, org_id=org_a, company=None, signal=None, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_a)
        assert result.available is False


class TestNegativeCycleGuard:
    def test_a_closed_at_before_created_at_is_excluded_not_crashed(self, session: Session):
        """Data-integrity guard: a corrupt/manually-edited row with
        closed_at before created_at must never poison the median or crash
        the endpoint."""
        org_id = uuid.uuid4()
        bad = Opportunity(
            organization_id=org_id,
            title="Corrupt row",
            status=OpportunityStatus.WON,
            created_at=datetime.now(UTC),
            closed_at=datetime.now(UTC) - timedelta(days=5),
        )
        session.add(bad)
        for days in (10, 10):
            _closed_opportunity(
                session, org_id=org_id, company=None, signal=None,
                status=OpportunityStatus.WON, created_days_ago=90, cycle_days=days,
            )
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        # Only 2 valid deals (the corrupt one excluded) — below _MIN_COHORT.
        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.available is False


class TestSignalRecalibration:
    def test_with_and_without_signal_cohorts_are_compared(self, session: Session):
        org_id = uuid.uuid4()

        # 3 closed deals that each got a NEW signal on their company while
        # the deal was open — cycle lengths 10/20/30 → median 20.
        for cycle_days in (10, 20, 30):
            company = _company(session, org_id=org_id)
            deal = _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.WON, created_days_ago=100, cycle_days=cycle_days,
            )
            _signal_at(
                session, org_id=org_id, company_id=company.id,
                detected_at=deal.created_at + timedelta(days=cycle_days / 2),
            )

        # 3 closed deals with no signal at all on their company —
        # cycle lengths 40/50/60 → median 50.
        for cycle_days in (40, 50, 60):
            company = _company(session, org_id=org_id)
            _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.LOST, created_days_ago=100, cycle_days=cycle_days,
            )

        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.available is True  # base prediction: 6-deal cohort
        recal = result.signal_recalibration
        assert recal is not None
        assert recal.available is True
        assert recal.with_signal_count == 3
        assert recal.without_signal_count == 3
        assert recal.with_signal_median_days == 20.0
        assert recal.without_signal_median_days == 50.0
        assert recal.delta_days == -30.0  # deals with a new signal closed faster here
        assert recal.target_has_new_signal is False  # target has no company at all

    def test_not_enough_deals_on_one_side_is_unavailable(self, session: Session):
        org_id = uuid.uuid4()

        # Only 2 with a signal — below _MIN_SIGNAL_COHORT.
        for cycle_days in (10, 20):
            company = _company(session, org_id=org_id)
            deal = _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.WON, created_days_ago=100, cycle_days=cycle_days,
            )
            _signal_at(session, org_id=org_id, company_id=company.id, detected_at=deal.created_at + timedelta(days=1))

        for cycle_days in (30, 40, 50, 60):
            company = _company(session, org_id=org_id)
            _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.LOST, created_days_ago=100, cycle_days=cycle_days,
            )

        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        assert result.available is True  # base prediction still fine: 6-deal cohort
        recal = result.signal_recalibration
        assert recal is not None
        assert recal.available is False
        assert recal.reason

    def test_the_signal_that_originated_a_deal_is_not_counted_as_a_new_one(self, session: Session):
        """A deal's own originating signal necessarily falls inside its
        (created_at, closed_at] window — it must never be mistaken for a
        NEW signal detected during the deal, or every deal with a known
        origin signal would wrongly count as "with signal"."""
        org_id = uuid.uuid4()

        for cycle_days in (10, 20, 30):
            company = _company(session, org_id=org_id)
            deal = _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.WON, created_days_ago=100, cycle_days=cycle_days,
            )
            _signal_at(session, org_id=org_id, company_id=company.id, detected_at=deal.created_at + timedelta(days=1))

        # 2 plain deals with nothing, plus 1 whose ONLY company signal is
        # the one that originated it — all 3 should land in "without".
        for cycle_days in (40, 50):
            company = _company(session, org_id=org_id)
            _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.LOST, created_days_ago=100, cycle_days=cycle_days,
            )
        tricky_company = _company(session, org_id=org_id)
        origin_signal = _signal_at(
            session, org_id=org_id, company_id=tricky_company.id,
            detected_at=datetime.now(UTC) - timedelta(days=95),  # inside its own (created_at, closed_at]
        )
        _closed_opportunity(
            session, org_id=org_id, company=tricky_company, signal=origin_signal,
            status=OpportunityStatus.LOST, created_days_ago=100, cycle_days=60,
        )

        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        result = CyclePredictorService(session).predict(target, None, None, org_id)
        recal = result.signal_recalibration
        assert recal is not None
        # If the origin signal were wrongly counted, without_signal_count
        # would drop to 2 (below _MIN_SIGNAL_COHORT) and this would be
        # unavailable instead.
        assert recal.available is True
        assert recal.without_signal_count == 3
        assert recal.without_signal_median_days == 50.0

    def test_target_has_new_signal_reflects_current_state_live(self, session: Session):
        """The whole point of this feature: it changes as new market
        signals arrive on the same company, without touching the deal
        itself."""
        org_id = uuid.uuid4()
        for cycle_days in (10, 20, 30):
            company = _company(session, org_id=org_id)
            deal = _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.WON, created_days_ago=100, cycle_days=cycle_days,
            )
            _signal_at(session, org_id=org_id, company_id=company.id, detected_at=deal.created_at + timedelta(days=1))
        for cycle_days in (40, 50, 60):
            company = _company(session, org_id=org_id)
            _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.LOST, created_days_ago=100, cycle_days=cycle_days,
            )

        target_company = _company(session, org_id=org_id)
        origin_signal = _signal(session, org_id=org_id, signal_type=SignalType.FUNDING_ROUND)
        target = _open_opportunity(
            session, org_id=org_id, company=target_company, signal=origin_signal, created_days_ago=5,
        )
        session.commit()

        before = CyclePredictorService(session).predict(target, origin_signal, target_company, org_id)
        assert before.signal_recalibration is not None
        # The origin signal itself must not count as "new".
        assert before.signal_recalibration.target_has_new_signal is False

        _signal_at(
            session, org_id=org_id, company_id=target_company.id,
            detected_at=datetime.now(UTC) - timedelta(days=1), signal_type=SignalType.LEADERSHIP_CHANGE,
        )
        session.commit()

        after = CyclePredictorService(session).predict(target, origin_signal, target_company, org_id)
        assert after.signal_recalibration is not None
        assert after.signal_recalibration.target_has_new_signal is True
        assert after.signal_recalibration.target_new_signal_types == ["leadership_change"]


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestCyclePredictionEndpoint:
    def test_404_for_unknown_opportunity(self, client: TestClient):
        auth = _register(client, org_name="Cycle 404 Co", email="owner@cycle404.co")
        resp = client.get(
            f"/api/v1/opportunities/{uuid.uuid4()}/cycle-prediction",
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 404

    def test_available_false_with_no_history_is_a_200_not_an_error(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Fresh Cycle Co", email="owner@freshcycle.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        resp = client.get(
            f"/api/v1/opportunities/{target.id}/cycle-prediction",
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["available"] is False
        assert body["reason"]

    def test_cross_org_opportunity_is_hidden(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Isolated Cycle Co", email="owner@isolatedcycle.co")
        other_org_id = uuid.uuid4()
        target = _open_opportunity(session, org_id=other_org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        resp = client.get(
            f"/api/v1/opportunities/{target.id}/cycle-prediction",
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 404

    def test_signal_recalibration_is_nested_in_the_response(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Recal Cycle Co", email="owner@recalcycle.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])

        for cycle_days in (10, 20, 30):
            company = _company(session, org_id=org_id)
            deal = _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.WON, created_days_ago=100, cycle_days=cycle_days,
            )
            _signal_at(session, org_id=org_id, company_id=company.id, detected_at=deal.created_at + timedelta(days=1))
        for cycle_days in (40, 50, 60):
            company = _company(session, org_id=org_id)
            _closed_opportunity(
                session, org_id=org_id, company=company, signal=None,
                status=OpportunityStatus.LOST, created_days_ago=100, cycle_days=cycle_days,
            )
        target = _open_opportunity(session, org_id=org_id, company=None, signal=None, created_days_ago=5)
        session.commit()

        resp = client.get(
            f"/api/v1/opportunities/{target.id}/cycle-prediction",
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 200, resp.text
        recal = resp.json()["signal_recalibration"]
        assert recal["available"] is True
        assert recal["with_signal_count"] == 3
        assert recal["without_signal_count"] == 3
        assert recal["delta_days"] == -30.0
