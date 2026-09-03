"""Phase 4 market-scan senses: GDELT press (keyless), Lever as a second
hiring board, the on-demand ``POST /companies/{id}/scan`` and the
``GET /market-sources`` status list. All hermetic — HTTP is patched."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.base import SignalType, UserRole
from app.models.company import Company
from app.models.organization import Organization
from app.models.signal import Signal
from app.models.user import User
from app.services.external_api.interface import ExternalSearchResult
from app.services.external_api.providers.hiring import HiringProvider
from app.services.external_api.providers.news import NewsProvider


def _owner(session: Session) -> tuple[Organization, User, dict]:
    org = Organization(name="Senses Org", slug=f"senses-{uuid.uuid4().hex[:8]}")
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
    return org, user, {"Authorization": f"Bearer {token}"}


def _response(status_code: int, json_body=None, content: bytes | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.content = content if content is not None else (b"{}" if json_body is not None else b"")
    resp.json.return_value = json_body
    resp.raise_for_status.side_effect = (
        httpx.HTTPStatusError("boom", request=MagicMock(), response=MagicMock()) if status_code >= 400 else None
    )
    return resp


class TestNewsProvider:
    def test_keeps_only_articles_that_name_the_company(self):
        body = {
            "articles": [
                {"title": "Acme raises $30M Series B", "url": "https://news.example/a", "domain": "news.example", "seendate": "20260901T100000Z"},
                {"title": "Acme raises $30M Series B", "url": "https://mirror.example/a", "domain": "mirror.example"},
                {"title": "Unrelated startup raises", "url": "https://news.example/b", "domain": "news.example"},
            ]
        }
        with patch("httpx.Client.get", return_value=_response(200, body)):
            result = NewsProvider().search_market_news(company_domain="acme.com", company_name="Acme")
        assert result.success and result.provider == "gdelt"
        assert [i["title"] for i in result.items] == ["Acme raises $30M Series B"]
        assert result.items[0]["link"] == "https://news.example/a"
        assert '"Acme"' in result.query

    def test_empty_body_is_a_clean_zero(self):
        with patch("httpx.Client.get", return_value=_response(200, None, content=b"")):
            result = NewsProvider().search_market_news(company_domain="acme.com", company_name="Acme")
        assert result.success and result.items == []

    def test_transport_error_is_a_failed_result_not_an_exception(self):
        with patch("httpx.Client.get", side_effect=httpx.ConnectError("down")):
            result = NewsProvider().search_market_news(company_domain="acme.com", company_name="Acme")
        assert result.success is False and "down" in (result.error or "")


class TestLeverBoard:
    def test_falls_through_to_lever_when_greenhouse_is_404(self):
        lever_body = [
            {"text": "Account Executive", "categories": {"team": "Sales"}},
            {"text": "SDR", "categories": {"team": "Sales"}},
            {"text": "Backend Engineer", "categories": {"team": "Engineering"}},
            {"text": "Designer", "categories": {"team": "Design"}},
            {"text": "Recruiter", "categories": {"team": "People"}},
        ]
        with patch("httpx.Client.get", side_effect=[_response(404), _response(200, lever_body)]):
            result = HiringProvider().search_market_news(company_domain="acme.com", company_name="Acme")
        assert result.success and len(result.items) == 1
        assert result.items[0]["link"] == "https://jobs.lever.co/acme"
        assert result.raw["board"] == "lever" and result.raw["gtm_count"] == 2

    def test_neither_board_is_a_clean_zero(self):
        with patch("httpx.Client.get", side_effect=[_response(404), _response(404)]):
            result = HiringProvider().search_market_news(company_domain="acme.com")
        assert result.success and result.items == []

    def test_greenhouse_error_still_tries_lever(self):
        with patch("httpx.Client.get", side_effect=[httpx.ConnectError("down"), _response(404)]):
            result = HiringProvider().search_market_news(company_domain="acme.com")
        assert result.success is False and "down" in (result.error or "")


class TestScanNow:
    def test_press_coverage_lands_as_a_signal_via_scan_endpoint(self, client: TestClient, session: Session):
        from app.core.config import settings as app_settings

        org, _, headers = _owner(session)
        company = Company(name="Acme", domain="acme.com", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        press = ExternalSearchResult(
            provider="gdelt",
            success=True,
            query='"Acme" (funding)',
            items=[{"title": "Acme raises $30M Series B", "link": "https://news.example/a", "snippet": "news.example"}],
        )
        quiet = ExternalSearchResult(provider="hiring", success=True, query="acme", items=[])
        with (
            patch.multiple(app_settings, MARKET_SCAN_ENABLED=True),
            patch("app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_press_coverage", return_value=press),
            patch("app.services.market_scan.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals", return_value=quiet),
        ):
            resp = client.post(f"/api/v1/companies/{company.id}/scan", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["enabled"] is True and body["signals_created"] == 1 and body["scanned_at"]

        signals = session.exec(select(Signal).where(Signal.company_id == company.id)).all()
        assert len(signals) == 1
        # Pre-typed as a news mention; the funding analyzer is free to refine
        # a "raises $30M Series B" headline into the more specific type — the
        # provider path is what this pins down (see external_id), not the
        # analyzer's verdict.
        assert signals[0].signal_type in (SignalType.NEWS_MENTION, SignalType.FUNDING_ROUND)
        assert signals[0].organization_id == org.id
        assert signals[0].external_id.startswith(f"market_scan:gdelt:{company.id}:")

    def test_scan_is_a_clean_noop_when_the_feature_is_off(self, client: TestClient, session: Session):
        org, _, headers = _owner(session)
        company = Company(name="Acme", domain="acme.com", organization_id=org.id)
        session.add(company)
        session.commit()
        with patch("app.services.market_scan.orchestrator.MarketScanOrchestrator._scan_company") as scan:
            resp = client.post(f"/api/v1/companies/{company.id}/scan", headers=headers)
        assert resp.status_code == 200 and resp.json() == {"enabled": False, "signals_created": 0, "scanned_at": None}
        scan.assert_not_called()

    def test_scan_refuses_another_organizations_company(self, client: TestClient, session: Session):
        _, _, headers = _owner(session)
        other_org, _, _ = _owner(session)
        company = Company(name="Theirs", domain="theirs.com", organization_id=other_org.id)
        session.add(company)
        session.commit()
        resp = client.post(f"/api/v1/companies/{company.id}/scan", headers=headers)
        assert resp.status_code == 404


class TestMarketSources:
    def test_lists_keyless_sources_as_configured(self, client: TestClient, session: Session):
        _, _, headers = _owner(session)
        resp = client.get("/api/v1/market-sources", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        by_name = {s["name"]: s for s in body["sources"]}
        assert by_name["gdelt"]["configured"] is True and by_name["gdelt"]["requires_credentials"] is False
        assert by_name["hiring"]["configured"] is True
        assert by_name["google_search"]["requires_credentials"] is True
        assert "scan_enabled" in body and body["interval_hours"] > 0

    def test_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/market-sources").status_code == 401
