"""Tests for the Jira OAuth connect/disconnect flow and the project-key
config endpoint — same shape as HubSpot's own tests
(test_hubspot_integration.py), covering the Jira-specific bits: the
accessible-resources cloud_id lookup, rotating refresh tokens actually
being persisted, and PATCH /integrations/jira/config. See
app.api.v1.endpoints.integrations and
app.services.integrations.jira_oauth.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.token_crypto import decrypt_token, encrypt_token
from app.models.integration_connection import IntegrationConnection
from app.services.integrations import jira_oauth
from app.services.integrations.jira_oauth import JiraOAuthError, JiraTokens
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
def _jira_oauth_configured():
    originals = (
        app_settings.JIRA_OAUTH_CLIENT_ID,
        app_settings.JIRA_OAUTH_CLIENT_SECRET,
        app_settings.JIRA_OAUTH_REDIRECT_URI,
    )
    app_settings.JIRA_OAUTH_CLIENT_ID = "test-jira-client-id"
    app_settings.JIRA_OAUTH_CLIENT_SECRET = "test-jira-client-secret"
    app_settings.JIRA_OAUTH_REDIRECT_URI = "http://localhost:8000/api/v1/integrations/jira/callback"
    yield
    (
        app_settings.JIRA_OAUTH_CLIENT_ID,
        app_settings.JIRA_OAUTH_CLIENT_SECRET,
        app_settings.JIRA_OAUTH_REDIRECT_URI,
    ) = originals


def _fake_tokens(*, access_token: str = "fake-jira-access", cloud_id: str = "cloud-123") -> JiraTokens:
    return JiraTokens(
        access_token=access_token,
        refresh_token="fake-jira-refresh",
        scope=jira_oauth.SCOPES,
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
        instance_url=cloud_id,
        site_label="realteam.atlassian.net",
    )


class TestListIntegrationsIncludesJira:
    def test_shows_up_disconnected_with_pm_category(self, client: TestClient):
        auth = _register(client, org_name="Jira Fresh Co", email="owner@jirafresh.co")
        resp = client.get("/api/v1/integrations", headers=_auth_headers(auth["access_token"]))
        row = next(r for r in resp.json() if r["provider"] == "jira")
        assert row["connected"] is False
        assert row["scope"] == "organization"
        assert row["category"] == "pm"


class TestJiraAuthorize:
    def test_requires_owner_or_admin(self, client: TestClient):
        auth = _register(client, org_name="Jira Locked Co", email="owner@jiralocked.co")
        owner_headers = _auth_headers(auth["access_token"])
        client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={"email": "member@jiralocked.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@jiralocked.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.get("/api/v1/integrations/jira/authorize", headers=member_headers)
        assert resp.status_code == 403

    def test_503_when_jira_oauth_not_configured(self, client: TestClient):
        app_settings.JIRA_OAUTH_CLIENT_ID = None
        auth = _register(client, org_name="No Jira Co", email="owner@nojira.co")
        resp = client.get("/api/v1/integrations/jira/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 503

    def test_owner_gets_a_state_carrying_authorize_url(self, client: TestClient):
        auth = _register(client, org_name="Jira Connect Co", email="owner@jiraconnect.co")
        resp = client.get("/api/v1/integrations/jira/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        url = resp.json()["authorize_url"]
        assert url.startswith("https://auth.atlassian.com/authorize?")
        assert "state=" in url
        assert "audience=api.atlassian.com" in url


class TestJiraCallback:
    def _state_for(self, client: TestClient, *, org_name: str, email: str) -> tuple[dict, str]:
        auth = _register(client, org_name=org_name, email=email)
        headers = _auth_headers(auth["access_token"])
        authorize = client.get("/api/v1/integrations/jira/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        return headers, state

    def test_user_denied_consent(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/jira/callback", params={"error": "access_denied"}, follow_redirects=False
        )
        assert resp.status_code in (302, 307)
        assert "integration_error=denied" in resp.headers["location"]

    def test_invalid_state_rejected(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/jira/callback",
            params={"code": "abc123", "state": "garbage"},
            follow_redirects=False,
        )
        assert "integration_error=invalid_state" in resp.headers["location"]

    def test_successful_connect_creates_the_row_and_shows_up_in_status(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        headers, state = self._state_for(client, org_name="Real Jira Connect Co", email="owner@realjiraconnect.co")

        monkeypatch.setattr(jira_oauth, "exchange_code_for_tokens", lambda _code: _fake_tokens())

        resp = client.get(
            "/api/v1/integrations/jira/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "connected=jira" in resp.headers["location"]

        status_resp = client.get("/api/v1/integrations", headers=headers)
        jira_row = next(r for r in status_resp.json() if r["provider"] == "jira")
        assert jira_row["connected"] is True
        assert jira_row["account_email"] == "realteam.atlassian.net"
        # Not configured a project key yet — detail should say so, not
        # claim sync is active.
        assert "falta configurar" in jira_row["detail"]

    def test_exchange_failure_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        _, state = self._state_for(client, org_name="Jira Fails Co", email="owner@jirafails.co")

        def _boom(_code: str):
            raise JiraOAuthError("Jira said no")

        monkeypatch.setattr(jira_oauth, "exchange_code_for_tokens", _boom)

        resp = client.get(
            "/api/v1/integrations/jira/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "integration_error=exchange_failed" in resp.headers["location"]


class TestJiraDisconnect:
    def test_owner_can_disconnect(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="Real Jira Disc Co", email="owner@realjiradisc.co")
        headers = _auth_headers(auth["access_token"])

        authorize = client.get("/api/v1/integrations/jira/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        monkeypatch.setattr(jira_oauth, "exchange_code_for_tokens", lambda _code: _fake_tokens())
        client.get("/api/v1/integrations/jira/callback", params={"code": "abc123", "state": state}, follow_redirects=False)

        resp = client.post("/api/v1/integrations/jira/disconnect", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"disconnected": True}

        status_resp = client.get("/api/v1/integrations", headers=headers)
        jira_row = next(r for r in status_resp.json() if r["provider"] == "jira")
        assert jira_row["connected"] is False


class TestJiraConfig:
    def _connect(self, client: TestClient, headers: dict, monkeypatch: pytest.MonkeyPatch) -> None:
        authorize = client.get("/api/v1/integrations/jira/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        monkeypatch.setattr(jira_oauth, "exchange_code_for_tokens", lambda _code: _fake_tokens())
        client.get("/api/v1/integrations/jira/callback", params={"code": "abc123", "state": state}, follow_redirects=False)

    def test_400_when_jira_not_connected(self, client: TestClient):
        auth = _register(client, org_name="No Jira Config Co", email="owner@nojiraconfig.co")
        resp = client.patch(
            "/api/v1/integrations/jira/config",
            headers=_auth_headers(auth["access_token"]),
            json={"project_key": "SALES"},
        )
        assert resp.status_code == 400

    def test_sets_project_key_and_activates_sync_detail(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="Jira Config Co", email="owner@jiraconfig.co")
        headers = _auth_headers(auth["access_token"])
        self._connect(client, headers, monkeypatch)

        resp = client.patch("/api/v1/integrations/jira/config", headers=headers, json={"project_key": "SALES"})
        assert resp.status_code == 200
        assert "SALES" in resp.json()["detail"]

        status_resp = client.get("/api/v1/integrations", headers=headers)
        jira_row = next(r for r in status_resp.json() if r["provider"] == "jira")
        assert "SALES" in jira_row["detail"]

    def test_member_cannot_set_project_key(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="Jira Member Co", email="owner@jiramember.co")
        owner_headers = _auth_headers(auth["access_token"])
        self._connect(client, owner_headers, monkeypatch)
        client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={"email": "member@jiramember.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@jiramember.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.patch("/api/v1/integrations/jira/config", headers=member_headers, json={"project_key": "SALES"})
        assert resp.status_code == 403


class TestGetValidJiraAccessToken:
    def test_returns_access_token_and_cloud_id(self, session: Session):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="jira",
                external_account_email="myteam.atlassian.net",
                access_token_encrypted=encrypt_token("still-fresh"),
                refresh_token_encrypted=encrypt_token("refresh-me"),
                token_expires_at=datetime.now(UTC) + timedelta(minutes=20),
                instance_url="cloud-abc",
            )
        )
        session.commit()

        result = IntegrationsService(session).get_valid_jira_access_token(org_id)
        assert result == ("still-fresh", "cloud-abc")

    def test_expired_token_refresh_persists_the_new_rotating_refresh_token(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ):
        """Regression test for the bug this phase fixed: Atlassian rotates
        refresh tokens (the old one is invalidated the moment it's used),
        so IntegrationsService must persist whatever refresh_token comes
        back from a refresh call, not just the access_token — see
        _get_valid_connection's own comment on this fix."""
        org_id = uuid.uuid4()
        conn = IntegrationConnection(
            organization_id=org_id,
            provider="jira",
            external_account_email="myteam.atlassian.net",
            access_token_encrypted=encrypt_token("stale"),
            refresh_token_encrypted=encrypt_token("original-refresh"),
            token_expires_at=datetime.now(UTC) - timedelta(minutes=5),
            instance_url="cloud-abc",
        )
        session.add(conn)
        session.commit()
        session.refresh(conn)
        conn_id = conn.id

        monkeypatch.setattr(
            jira_oauth,
            "refresh_access_token",
            lambda _refresh_token: JiraTokens(
                access_token="brand-new-jira",
                refresh_token="rotated-refresh",
                scope=jira_oauth.SCOPES,
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
                instance_url="cloud-abc",
            ),
        )

        result = IntegrationsService(session).get_valid_jira_access_token(org_id)
        assert result == ("brand-new-jira", "cloud-abc")

        session.expire_all()
        row = session.get(IntegrationConnection, conn_id)
        assert row is not None
        assert decrypt_token(row.refresh_token_encrypted) == "rotated-refresh"

    def test_no_connection_returns_none(self, session: Session):
        assert IntegrationsService(session).get_valid_jira_access_token(uuid.uuid4()) is None
