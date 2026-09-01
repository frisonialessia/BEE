"""Tests for the market-scan cron tick — see
app.api.v1.endpoints.internal_market_scan and app.services.market_scan.

TestMarketScanTickAuth/TestMarketScanTickScheduling cover Phase 1's
scheduling/cursor/audit-log plumbing (a company with no configured
provider result still produces 0 signals, same as Phase 1 before any
provider existed). TestMarketScanPhase2GoogleProvider covers Phase 2:
Google Search's market-news query wired through to real Signal rows via
the same SignalEngine.ingest() the webhook endpoint uses.
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.base import SignalSource, SignalType, utcnow
from app.models.company import Company
from app.models.market_scan_log import MarketScanLog
from app.models.signal import Signal
from app.services.external_api.interface import ExternalSearchResult


@pytest.fixture(autouse=True)
def _no_real_hiring_network_calls():
    """HiringProvider.is_configured() is always True (Greenhouse's
    boards-api needs no credentials) — unlike GoogleSearchProvider, there's
    no missing-API-key gate keeping it out of a real network call. Every
    test in this file gets a safe, zero-item default for it; tests that
    specifically exercise the Hiring provider override this explicitly.
    Hermetic test suite, no exceptions — see CLAUDE.md.
    """
    with patch(
        "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals",
        return_value=ExternalSearchResult(provider="hiring", success=True, query="", items=[]),
    ):
        yield


class TestMarketScanTickAuth:
    def test_disabled_by_default_returns_404(self, client: TestClient):
        resp = client.get("/api/v1/internal/market-scan/tick")
        assert resp.status_code == 404

    def test_missing_secret_rejected_when_configured(self, client: TestClient):
        from unittest.mock import patch

        from app.core.config import settings as app_settings

        with patch.object(app_settings, "CRON_SECRET", "super-secret-value"):
            resp = client.get("/api/v1/internal/market-scan/tick")
        assert resp.status_code == 401

    def test_wrong_secret_rejected(self, client: TestClient):
        from unittest.mock import patch

        from app.core.config import settings as app_settings

        with patch.object(app_settings, "CRON_SECRET", "super-secret-value"):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer not-it"},
            )
        assert resp.status_code == 401

    def test_correct_secret_but_feature_disabled_is_a_clean_noop(self, client: TestClient):
        from unittest.mock import patch

        from app.core.config import settings as app_settings

        with patch.object(app_settings, "CRON_SECRET", "super-secret-value"):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body == {
            "enabled": False,
            "companies_scanned": 0,
            "signals_created": 0,
            "duration_ms": 0,
            "errors": [],
        }


class TestMarketScanTickScheduling:
    def _enabled(self):
        from unittest.mock import patch

        from app.core.config import settings as app_settings

        return patch.multiple(
            app_settings,
            CRON_SECRET="super-secret-value",
            MARKET_SCAN_ENABLED=True,
            MARKET_SCAN_BATCH_SIZE=2,
        )

    def test_never_scanned_companies_are_picked_up_and_cursor_advances(
        self, client: TestClient, session: Session
    ):
        due = Company(name="Never Scanned Co")
        session.add(due)
        session.commit()
        session.refresh(due)
        assert due.next_scan_due_at is None

        with self._enabled():
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["enabled"] is True
        assert body["companies_scanned"] == 1
        assert body["signals_created"] == 0  # Phase 1: no provider wired yet
        assert body["errors"] == []

        session.refresh(due)
        assert due.last_scanned_at is not None
        assert due.next_scan_due_at is not None
        # SQLite round-trips a plain (non-timezone) DateTime column as naive,
        # same convention this migration uses as every other DateTime column
        # in this codebase (see e.g. migration 025) — strip tzinfo from the
        # comparison side rather than the stored value.
        naive_floor = (utcnow() + timedelta(hours=23)).replace(tzinfo=None)
        assert due.next_scan_due_at > naive_floor

    def test_not_yet_due_company_is_left_alone(self, client: TestClient, session: Session):
        not_due = Company(name="Recently Scanned Co", next_scan_due_at=utcnow() + timedelta(days=1))
        session.add(not_due)
        session.commit()
        session.refresh(not_due)
        original_due_at = not_due.next_scan_due_at

        with self._enabled():
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        assert resp.json()["companies_scanned"] == 0

        session.refresh(not_due)
        assert not_due.next_scan_due_at == original_due_at

    def test_batch_size_caps_companies_scanned_per_tick(self, client: TestClient, session: Session):
        for i in range(5):
            session.add(Company(name=f"Co {i}"))
        session.commit()

        with self._enabled():  # MARKET_SCAN_BATCH_SIZE=2 in _enabled()
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        assert resp.json()["companies_scanned"] == 2

    def test_tick_writes_a_market_scan_log_row(self, client: TestClient, session: Session):
        session.add(Company(name="Logged Co"))
        session.commit()

        with self._enabled():
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text

        logs = session.exec(select(MarketScanLog)).all()
        assert len(logs) == 1
        assert logs[0].companies_scanned == 1
        assert logs[0].signals_created == 0
        assert logs[0].errors == []
        assert logs[0].duration_ms >= 0


def _fake_news(*, items=None, success=True, mock=True) -> ExternalSearchResult:
    return ExternalSearchResult(
        provider="google_search",
        success=success,
        query="test",
        items=items or [],
        mock=mock,
    )


class TestMarketScanPhase2GoogleProvider:
    """_scan_company wired to ExternalAPIOrchestrator.scan_market_news — see
    that method and GoogleSearchProvider.search_market_news for the real
    HTTP-call path (untested here; mocked at the orchestrator boundary,
    same as every other external-provider test in this suite: a real
    network call has no place in a hermetic test)."""

    def _enabled(self):
        from app.core.config import settings as app_settings

        return patch.multiple(
            app_settings,
            CRON_SECRET="super-secret-value",
            MARKET_SCAN_ENABLED=True,
            MARKET_SCAN_BATCH_SIZE=20,
        )

    def _tick(self, client: TestClient):
        with self._enabled():
            return client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )

    def test_no_configured_google_provider_is_a_clean_zero_not_an_error(
        self, client: TestClient, session: Session
    ):
        """Without GOOGLE_SEARCH_API_KEY/CX configured (the default test
        environment), search_market_news runs in its own mock mode — which
        returns success=True but zero items (see GoogleSearchProvider's
        docstring on why mock mode never fabricates a headline here). This
        is the same behavior Phase 1's tests already relied on; asserted
        explicitly here as the Phase-2-aware version of that guarantee."""
        session.add(Company(name="Unconfigured Co", domain="unconfigured.example.com"))
        session.commit()

        resp = self._tick(client)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["companies_scanned"] == 1
        assert body["signals_created"] == 0
        assert body["errors"] == []

    def test_news_item_becomes_a_signal(self, client: TestClient, session: Session):
        company = Company(name="Acme Robotics", domain="acme-robotics.example.com")
        session.add(company)
        session.commit()
        session.refresh(company)

        news = _fake_news(
            items=[
                {
                    "title": "Acme Robotics raises $40M Series C",
                    "link": "https://news.example.com/acme-series-c",
                    "snippet": "Acme Robotics announced a $40M Series C round.",
                }
            ]
        )
        with (
            self._enabled(),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                return_value=news,
            ),
        ):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["companies_scanned"] == 1
        assert body["signals_created"] == 1
        assert body["errors"] == []

        signals = session.exec(select(Signal).where(Signal.company_id == company.id)).all()
        assert len(signals) == 1
        signal = signals[0]
        assert signal.title == "Acme Robotics raises $40M Series C"
        # NEWS_MENTION is only the pre-classification passed in — SignalEngine's
        # analyzers legitimately override it when the content matches a more
        # specific type (this title's "raises...Series C" correctly triggers
        # the funding analyzer), same as any other pre-typed webhook payload.
        # source is what's actually guaranteed here: it's never reclassified.
        assert signal.signal_type in (SignalType.NEWS_MENTION, SignalType.FUNDING_ROUND)
        assert signal.source == SignalSource.MARKET_SCAN
        assert signal.external_id is not None
        assert signal.external_id.startswith(f"market_scan:google_search:{company.id}:")

    def test_same_article_on_a_later_tick_is_not_duplicated(
        self, client: TestClient, session: Session
    ):
        """SignalEngine's external_id-based idempotency (the same mechanism
        POST /api/v1/signals/webhook relies on) must dedupe a re-scan that
        turns up the same article — MarketScanOrchestrator does nothing
        provider-specific to prevent this itself, it's inherited for free
        by going through SignalEngine.ingest() instead of a parallel path."""
        company = Company(name="Beta Systems", domain="beta-systems.example.com")
        session.add(company)
        session.commit()

        news = _fake_news(
            items=[
                {
                    "title": "Beta Systems opens new Austin office",
                    "link": "https://news.example.com/beta-austin",
                    "snippet": "Beta Systems is expanding to Austin, TX.",
                }
            ]
        )
        with patch(
            "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_market_news",
            return_value=news,
        ):
            first = self._tick(client)
            assert first.json()["signals_created"] == 1

            # Company is due again immediately for this test (force it) —
            # a real tick wouldn't re-pick it up until MARKET_SCAN_INTERVAL_HOURS
            # later, but the dedup guarantee must hold regardless of when.
            company_row = session.exec(
                select(Company).where(Company.id == company.id)
            ).one()
            company_row.next_scan_due_at = utcnow() - timedelta(minutes=1)
            session.add(company_row)
            session.commit()

            second = self._tick(client)

        assert second.json()["companies_scanned"] == 1
        assert second.json()["signals_created"] == 0  # deduplicated, not re-created

        signals = session.exec(select(Signal).where(Signal.company_id == company.id)).all()
        assert len(signals) == 1

    def test_caps_signals_at_max_per_company_per_tick(
        self, client: TestClient, session: Session
    ):
        company = Company(name="Gamma Corp", domain="gamma-corp.example.com")
        session.add(company)
        session.commit()

        news = _fake_news(
            items=[
                {"title": f"Gamma Corp news item {i}", "link": f"https://news.example.com/gamma-{i}"}
                for i in range(6)
            ]
        )
        with (
            self._enabled(),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                return_value=news,
            ),
        ):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.json()["signals_created"] == 3  # _MAX_SIGNALS_PER_COMPANY, not all 6

    def test_provider_error_on_one_company_does_not_abort_the_batch(
        self, client: TestClient, session: Session
    ):
        session.add(Company(name="Fails To Scan", domain="fails.example.com"))
        session.add(Company(name="Scans Fine", domain="fine.example.com"))
        session.commit()

        good_news = _fake_news(items=[{"title": "Scans Fine wins big client", "link": "https://x.example.com/1"}])

        call_count = {"n": 0}

        def flaky_scan(self, **kwargs):  # noqa: ARG001 — matches the patched method's signature
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("provider timeout")
            return good_news

        with (
            self._enabled(),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                flaky_scan,
            ),
        ):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["companies_scanned"] == 2
        assert body["signals_created"] == 1
        assert len(body["errors"]) == 1


class TestMarketScanPhase3HiringProvider:
    """_scan_company also calls ExternalAPIOrchestrator.scan_hiring_signals
    (mocked to a zero-item default for every other test in this file via
    the autouse fixture above) — these tests override that default to
    exercise the Hiring-specific path. GoogleSearchProvider's own mock
    mode (no API key configured) already returns zero items by default,
    so it needs no separate patching here."""

    def _enabled(self):
        from app.core.config import settings as app_settings

        return patch.multiple(
            app_settings,
            CRON_SECRET="super-secret-value",
            MARKET_SCAN_ENABLED=True,
            MARKET_SCAN_BATCH_SIZE=20,
        )

    def test_hiring_surge_becomes_a_signal(self, client: TestClient, session: Session):
        company = Company(name="Delta Sales Co", domain="delta-sales.example.com")
        session.add(company)
        session.commit()
        session.refresh(company)

        hiring_result = ExternalSearchResult(
            provider="hiring",
            success=True,
            query="delta-sales",
            items=[
                {
                    "title": "Delta Sales Co has 8 open positions including 3 in Sales/GTM roles — hiring surge",
                    "link": "https://boards.greenhouse.io/delta-sales",
                    "snippet": "8 open roles found on Delta Sales Co's Greenhouse board.",
                }
            ],
            mock=False,
        )
        with (
            self._enabled(),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals",
                return_value=hiring_result,
            ),
        ):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["companies_scanned"] == 1
        assert body["signals_created"] == 1

        signals = session.exec(select(Signal).where(Signal.company_id == company.id)).all()
        assert len(signals) == 1
        assert signals[0].source == SignalSource.MARKET_SCAN
        assert signals[0].signal_type in (SignalType.HIRING, SignalType.EXPANSION)
        assert signals[0].external_id.startswith(f"market_scan:hiring:{company.id}:")

    def test_google_and_hiring_signals_both_land_independently(
        self, client: TestClient, session: Session
    ):
        """Two different providers about the same company, in the same
        tick — each gets its own Signal (different provider_key in the
        idempotency key means no cross-provider collision)."""
        company = Company(name="Epsilon Corp", domain="epsilon.example.com")
        session.add(company)
        session.commit()

        news = ExternalSearchResult(
            provider="google_search",
            success=True,
            query="Epsilon Corp",
            items=[{"title": "Epsilon Corp announces new partnership", "link": "https://news.example.com/epsilon"}],
        )
        hiring_result = ExternalSearchResult(
            provider="hiring",
            success=True,
            query="epsilon",
            items=[{"title": "Epsilon Corp is hiring — 6 open roles", "link": "https://boards.greenhouse.io/epsilon"}],
        )
        with (
            self._enabled(),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                return_value=news,
            ),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals",
                return_value=hiring_result,
            ),
        ):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.json()["signals_created"] == 2

    def test_hiring_provider_error_does_not_block_google_signal(
        self, client: TestClient, session: Session
    ):
        session.add(Company(name="Zeta Inc", domain="zeta.example.com"))
        session.commit()

        news = ExternalSearchResult(
            provider="google_search",
            success=True,
            query="Zeta Inc",
            items=[{"title": "Zeta Inc raises Series A", "link": "https://news.example.com/zeta"}],
        )
        hiring_error = ExternalSearchResult(
            provider="hiring", success=False, query="zeta", error="Greenhouse lookup timed out"
        )
        with (
            self._enabled(),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                return_value=news,
            ),
            patch(
                "app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals",
                return_value=hiring_error,
            ),
        ):
            resp = client.get(
                "/api/v1/internal/market-scan/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["signals_created"] == 1  # Google's signal still landed
        assert body["errors"] == []  # a provider returning success=False isn't a tick-level error


class TestHiringProviderUnit:
    """HiringProvider in isolation — the Greenhouse HTTP call itself is
    mocked (via httpx.Client.get, patched at the module the provider
    imports it from) rather than hitting a real network endpoint."""

    def test_board_not_found_is_a_clean_zero_not_an_error(self):
        from unittest.mock import MagicMock

        from app.services.external_api.providers.hiring import HiringProvider

        provider = HiringProvider()
        fake_response = MagicMock(status_code=404)
        with patch("httpx.Client.get", return_value=fake_response):
            result = provider.search_market_news(company_domain="totally-not-on-greenhouse.example.com")

        assert result.success is True
        assert result.items == []

    def test_few_open_roles_is_not_a_surge(self):
        from unittest.mock import MagicMock

        from app.services.external_api.providers.hiring import HiringProvider

        provider = HiringProvider()
        fake_response = MagicMock(status_code=200)
        fake_response.json.return_value = {"jobs": [{"title": "Office Manager"}]}  # 1 job, below threshold
        with patch("httpx.Client.get", return_value=fake_response):
            result = provider.search_market_news(company_domain="small-co.example.com", company_name="Small Co")

        assert result.success is True
        assert result.items == []

    def test_many_open_roles_produces_one_surge_item(self):
        from unittest.mock import MagicMock

        from app.services.external_api.providers.hiring import HiringProvider

        provider = HiringProvider()
        fake_response = MagicMock(status_code=200)
        fake_response.json.return_value = {
            "jobs": [{"title": f"Role {i}", "departments": []} for i in range(7)]
        }
        with patch("httpx.Client.get", return_value=fake_response):
            result = provider.search_market_news(company_domain="growing-co.example.com", company_name="Growing Co")

        assert result.success is True
        assert len(result.items) == 1
        assert "7 open positions" in result.items[0]["title"]
        assert result.mock is False  # a real (mocked-HTTP) attempt, not fabricated placeholder data
