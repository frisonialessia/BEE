"""Tests for the market-scan cron tick — see
app.api.v1.endpoints.internal_market_scan and app.services.market_scan.

Phase 1 scope: the scheduling/cursor/audit-log plumbing. No provider is
wired yet, so a successful tick always produces 0 signals — these tests
assert the cursor and audit-log mechanics, not signal content.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.base import utcnow
from app.models.company import Company
from app.models.market_scan_log import MarketScanLog


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
