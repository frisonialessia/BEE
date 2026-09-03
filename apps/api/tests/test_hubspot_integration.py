"""Tests for the HubSpot OAuth connect/disconnect flow — same shape as
Salesforce's own tests (test_integrations.py's TestSalesforce* classes),
covering the HubSpot-specific bits: no instance_url, a real expires_in,
and the hub_domain account-label lookup. See
app.api.v1.endpoints.integrations and app.services.integrations.
hubspot_oauth.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.token_crypto import encrypt_token
from app.models.integration_connection import IntegrationConnection
from app.services.integrations import hubspot_oauth
from app.services.integrations.hubspot_oauth import HubSpotOAuthError, HubSpotTokens
from app.services.integrations.service import IntegrationsService


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _token_encryption_key():
    from app.core import token_crypto

    original = app_settings.TOKEN_ENCRYPTION_KEY
    app_settings.TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
    token_crypto._fernet.cache_clear()
    yield
    app_settings.TOKEN_ENCRYPTION_KEY = original
    token_crypto._fernet.cache_clear()


@pytest.fixture(autouse=True)
def _hubspot_oauth_configured():
    originals = (
        app_settings.HUBSPOT_OAUTH_CLIENT_ID,
        app_settings.HUBSPOT_OAUTH_CLIENT_SECRET,
        app_settings.HUBSPOT_OAUTH_REDIRECT_URI,
    )
    app_settings.HUBSPOT_OAUTH_CLIENT_ID = "test-hs-client-id"
    app_settings.HUBSPOT_OAUTH_CLIENT_SECRET = "test-hs-client-secret"
    app_settings.HUBSPOT_OAUTH_REDIRECT_URI = "http://localhost:8000/api/v1/integrations/hubspot/callback"
    yield
    (
        app_settings.HUBSPOT_OAUTH_CLIENT_ID,
        app_settings.HUBSPOT_OAUTH_CLIENT_SECRET,
        app_settings.HUBSPOT_OAUTH_REDIRECT_URI,
    ) = originals


class TestListIntegrationsIncludesHubSpot:
    def test_shows_up_disconnected_with_crm_category(self, client: TestClient):
        auth = _register(client, org_name="HS Fresh Co", email="owner@hsfresh.co")
        resp = client.get("/api/v1/integrations", headers=_auth_headers(auth["access_token"]))
        row = next(r for r in resp.json() if r["provider"] == "hubspot")
        assert row["connected"] is False
        assert row["scope"] == "organization"
        assert row["category"] == "crm"


class TestHubSpotAuthorize:
    def test_requires_owner_or_admin(self, client: TestClient):
        auth = _register(client, org_name="HS Locked Co", email="owner@hslocked.co")
        owner_headers = _auth_headers(auth["access_token"])
        client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={"email": "member@hslocked.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@hslocked.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.get("/api/v1/integrations/hubspot/authorize", headers=member_headers)
        assert resp.status_code == 403

    def test_503_when_hubspot_oauth_not_configured(self, client: TestClient):
        app_settings.HUBSPOT_OAUTH_CLIENT_ID = None
        auth = _register(client, org_name="No HS Co", email="owner@nohs.co")
        resp = client.get("/api/v1/integrations/hubspot/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 503

    def test_owner_gets_a_state_carrying_authorize_url(self, client: TestClient):
        auth = _register(client, org_name="HS Connect Co", email="owner@hsconnect.co")
        resp = client.get("/api/v1/integrations/hubspot/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        url = resp.json()["authorize_url"]
        assert url.startswith("https://app.hubspot.com/oauth/authorize?")
        assert "state=" in url


class TestHubSpotCallback:
    def _state_for(self, client: TestClient, *, org_name: str, email: str) -> tuple[dict, str]:
        auth = _register(client, org_name=org_name, email=email)
        headers = _auth_headers(auth["access_token"])
        authorize = client.get("/api/v1/integrations/hubspot/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        return headers, state

    def test_user_denied_consent(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/hubspot/callback", params={"error": "access_denied"}, follow_redirects=False
        )
        assert resp.status_code in (302, 307)
        assert "integration_error=denied" in resp.headers["location"]

    def test_invalid_state_rejected(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/hubspot/callback",
            params={"code": "abc123", "state": "garbage"},
            follow_redirects=False,
        )
        assert "integration_error=invalid_state" in resp.headers["location"]

    def test_successful_connect_creates_the_row_and_shows_up_in_status(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        headers, state = self._state_for(client, org_name="Real HS Connect Co", email="owner@realhsconnect.co")

        monkeypatch.setattr(
            hubspot_oauth,
            "exchange_code_for_tokens",
            lambda _code: HubSpotTokens(
                access_token="fake-hs-access",
                refresh_token="fake-hs-refresh",
                scope=hubspot_oauth.SCOPES,
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            ),
        )
        monkeypatch.setattr(hubspot_oauth, "fetch_account_label", lambda _token: "realhsconnect.hubspot.com")

        resp = client.get(
            "/api/v1/integrations/hubspot/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "connected=hubspot" in resp.headers["location"]

        status_resp = client.get("/api/v1/integrations", headers=headers)
        hs_row = next(r for r in status_resp.json() if r["provider"] == "hubspot")
        assert hs_row["connected"] is True
        assert hs_row["account_email"] == "realhsconnect.hubspot.com"

    def test_exchange_failure_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        _, state = self._state_for(client, org_name="HS Fails Co", email="owner@hsfails.co")

        def _boom(_code: str):
            raise HubSpotOAuthError("HubSpot said no")

        monkeypatch.setattr(hubspot_oauth, "exchange_code_for_tokens", _boom)

        resp = client.get(
            "/api/v1/integrations/hubspot/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "integration_error=exchange_failed" in resp.headers["location"]


class TestHubSpotDisconnect:
    def test_owner_can_disconnect(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="Real HS Disc Co", email="owner@realhsdisc.co")
        headers = _auth_headers(auth["access_token"])

        authorize = client.get("/api/v1/integrations/hubspot/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        monkeypatch.setattr(
            hubspot_oauth,
            "exchange_code_for_tokens",
            lambda _code: HubSpotTokens(
                access_token="fake-hs-access",
                refresh_token="fake-hs-refresh",
                scope=hubspot_oauth.SCOPES,
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            ),
        )
        monkeypatch.setattr(hubspot_oauth, "fetch_account_label", lambda _token: "realhsdisc.hubspot.com")
        client.get(
            "/api/v1/integrations/hubspot/callback", params={"code": "abc123", "state": state}, follow_redirects=False
        )

        resp = client.post("/api/v1/integrations/hubspot/disconnect", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"disconnected": True}

        status_resp = client.get("/api/v1/integrations", headers=headers)
        hs_row = next(r for r in status_resp.json() if r["provider"] == "hubspot")
        assert hs_row["connected"] is False


class TestGetValidHubSpotAccessToken:
    def test_returns_a_bare_access_token_no_instance_url(self, session: Session):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="hubspot",
                external_account_email="myportal.hubspot.com",
                access_token_encrypted=encrypt_token("still-fresh"),
                refresh_token_encrypted=encrypt_token("refresh-me"),
                token_expires_at=datetime.now(UTC) + timedelta(minutes=20),
            )
        )
        session.commit()

        result = IntegrationsService(session).get_valid_hubspot_access_token(org_id)
        assert result == "still-fresh"

    def test_expired_token_is_refreshed_and_persisted(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="hubspot",
                external_account_email="myportal.hubspot.com",
                access_token_encrypted=encrypt_token("stale"),
                refresh_token_encrypted=encrypt_token("long-lived-refresh"),
                token_expires_at=datetime.now(UTC) - timedelta(minutes=5),
            )
        )
        session.commit()

        monkeypatch.setattr(
            hubspot_oauth,
            "refresh_access_token",
            lambda _refresh_token: HubSpotTokens(
                access_token="brand-new-hs",
                refresh_token="long-lived-refresh",
                scope=hubspot_oauth.SCOPES,
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            ),
        )

        result = IntegrationsService(session).get_valid_hubspot_access_token(org_id)
        assert result == "brand-new-hs"
