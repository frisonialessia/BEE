"""Tests for the Integrations page: Gmail OAuth connect/disconnect flow,
the org-vs-server status distinction, and the token-refresh path that
backs an actual send. See app.api.v1.endpoints.integrations.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.security import InvalidTokenError, create_oauth_state_token, decode_oauth_state_token
from app.core.token_crypto import decrypt_token, encrypt_token
from app.models.integration_connection import IntegrationConnection
from app.services.integrations import gmail_oauth, linkedin_oauth, salesforce_oauth
from app.services.integrations.gmail_oauth import GmailOAuthError, GmailTokens
from app.services.integrations.linkedin_oauth import LinkedInOAuthError, LinkedInTokens
from app.services.integrations.salesforce_oauth import SalesforceOAuthError, SalesforceTokens
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
    """Every test in this file needs a real Fernet key to encrypt/decrypt
    with — set one for the duration and clear the lru_cache'd Fernet
    instance on both sides so this doesn't leak into (or read stale state
    from) other test files."""
    from app.core import token_crypto

    original = app_settings.TOKEN_ENCRYPTION_KEY
    app_settings.TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
    token_crypto._fernet.cache_clear()
    yield
    app_settings.TOKEN_ENCRYPTION_KEY = original
    token_crypto._fernet.cache_clear()


@pytest.fixture(autouse=True)
def _google_oauth_configured():
    """Fake-but-well-formed Google OAuth client config so
    gmail_oauth.is_configured() is True — no real network call is ever made
    in these tests (exchange/refresh/userinfo are monkeypatched per-test)."""
    originals = (
        app_settings.GOOGLE_OAUTH_CLIENT_ID,
        app_settings.GOOGLE_OAUTH_CLIENT_SECRET,
        app_settings.GOOGLE_OAUTH_REDIRECT_URI,
    )
    app_settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
    app_settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret"
    app_settings.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:8000/api/v1/integrations/gmail/callback"
    yield
    (
        app_settings.GOOGLE_OAUTH_CLIENT_ID,
        app_settings.GOOGLE_OAUTH_CLIENT_SECRET,
        app_settings.GOOGLE_OAUTH_REDIRECT_URI,
    ) = originals


@pytest.fixture(autouse=True)
def _linkedin_oauth_configured():
    """Fake-but-well-formed LinkedIn OAuth app config, same rationale as
    _google_oauth_configured above."""
    originals = (
        app_settings.LINKEDIN_OAUTH_CLIENT_ID,
        app_settings.LINKEDIN_OAUTH_CLIENT_SECRET,
        app_settings.LINKEDIN_OAUTH_REDIRECT_URI,
    )
    app_settings.LINKEDIN_OAUTH_CLIENT_ID = "test-li-client-id"
    app_settings.LINKEDIN_OAUTH_CLIENT_SECRET = "test-li-client-secret"
    app_settings.LINKEDIN_OAUTH_REDIRECT_URI = "http://localhost:8000/api/v1/integrations/linkedin/callback"
    yield
    (
        app_settings.LINKEDIN_OAUTH_CLIENT_ID,
        app_settings.LINKEDIN_OAUTH_CLIENT_SECRET,
        app_settings.LINKEDIN_OAUTH_REDIRECT_URI,
    ) = originals


@pytest.fixture(autouse=True)
def _salesforce_oauth_configured():
    """Fake-but-well-formed Salesforce Connected App config, same rationale
    as _google_oauth_configured above."""
    originals = (
        app_settings.SALESFORCE_OAUTH_CLIENT_ID,
        app_settings.SALESFORCE_OAUTH_CLIENT_SECRET,
        app_settings.SALESFORCE_OAUTH_REDIRECT_URI,
    )
    app_settings.SALESFORCE_OAUTH_CLIENT_ID = "test-sf-client-id"
    app_settings.SALESFORCE_OAUTH_CLIENT_SECRET = "test-sf-client-secret"
    app_settings.SALESFORCE_OAUTH_REDIRECT_URI = "http://localhost:8000/api/v1/integrations/salesforce/callback"
    yield
    (
        app_settings.SALESFORCE_OAUTH_CLIENT_ID,
        app_settings.SALESFORCE_OAUTH_CLIENT_SECRET,
        app_settings.SALESFORCE_OAUTH_REDIRECT_URI,
    ) = originals


class TestTokenCrypto:
    def test_round_trip(self):
        ciphertext = encrypt_token("ya29.super-secret-access-token")
        assert ciphertext != "ya29.super-secret-access-token"
        assert decrypt_token(ciphertext) == "ya29.super-secret-access-token"

    def test_unset_key_raises_clearly(self):
        from app.core import token_crypto

        app_settings.TOKEN_ENCRYPTION_KEY = None
        token_crypto._fernet.cache_clear()
        with pytest.raises(RuntimeError, match="TOKEN_ENCRYPTION_KEY"):
            encrypt_token("anything")


class TestOAuthStateToken:
    def test_round_trip(self):
        org_id = uuid.uuid4()
        token = create_oauth_state_token(org_id, purpose="gmail_connect")
        assert decode_oauth_state_token(token, expected_purpose="gmail_connect") == org_id

    def test_wrong_purpose_rejected(self):
        token = create_oauth_state_token(uuid.uuid4(), purpose="gmail_connect")
        with pytest.raises(InvalidTokenError):
            decode_oauth_state_token(token, expected_purpose="linkedin_connect")

    def test_garbage_token_rejected(self):
        with pytest.raises(InvalidTokenError):
            decode_oauth_state_token("not-a-real-token", expected_purpose="gmail_connect")

    def test_session_token_rejected_as_state(self, client: TestClient):
        """A real login session token must not double as OAuth state —
        distinct 'type' claims keep the two token kinds from being swapped."""
        auth = _register(client, org_name="Swap Co", email="owner@swap.co")
        with pytest.raises(InvalidTokenError):
            decode_oauth_state_token(auth["access_token"], expected_purpose="gmail_connect")


class TestListIntegrations:
    def test_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/integrations").status_code == 401

    def test_includes_gmail_disconnected_and_server_channels(self, client: TestClient):
        auth = _register(client, org_name="Fresh Co", email="owner@fresh.co")
        resp = client.get("/api/v1/integrations", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        rows = {r["provider"]: r for r in resp.json()}

        assert rows["gmail"]["connected"] is False
        assert rows["gmail"]["scope"] == "organization"
        assert rows["gmail"]["category"] == "email"
        assert rows["linkedin"]["connected"] is False
        assert rows["linkedin"]["scope"] == "organization"
        assert rows["linkedin"]["category"] == "social"
        assert rows["salesforce"]["connected"] is False
        assert rows["salesforce"]["scope"] == "organization"
        assert rows["salesforce"]["category"] == "crm"
        # Server-wide channels are surfaced too, but read-only. LinkedIn's
        # server credential isn't shown separately — it would be a second,
        # confusingly-named row next to the one that actually has a button.
        assert rows["email"]["scope"] == "server"
        assert rows["email"]["category"] == "email"
        assert "twitter" in rows
        assert rows["twitter"]["category"] == "social"


class TestGmailAuthorize:
    def test_requires_owner_or_admin(self, client: TestClient):
        auth = _register(client, org_name="Locked Co", email="owner@locked.co")
        owner_headers = _auth_headers(auth["access_token"])
        client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={"email": "member@locked.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@locked.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.get("/api/v1/integrations/gmail/authorize", headers=member_headers)
        assert resp.status_code == 403

    def test_503_when_google_oauth_not_configured(self, client: TestClient):
        app_settings.GOOGLE_OAUTH_CLIENT_ID = None
        auth = _register(client, org_name="No Google Co", email="owner@nogoogle.co")
        resp = client.get("/api/v1/integrations/gmail/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 503

    def test_owner_gets_a_state_carrying_authorize_url(self, client: TestClient):
        auth = _register(client, org_name="Connect Co", email="owner@connect.co")
        resp = client.get("/api/v1/integrations/gmail/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        url = resp.json()["authorize_url"]
        assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
        assert "state=" in url
        assert "scope=" in url


class TestGmailCallback:
    def _state_for(self, client: TestClient, *, org_name: str, email: str) -> tuple[dict, str]:
        auth = _register(client, org_name=org_name, email=email)
        headers = _auth_headers(auth["access_token"])
        authorize = client.get("/api/v1/integrations/gmail/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        return headers, state

    def test_user_denied_consent(self, client: TestClient):
        resp = client.get("/api/v1/integrations/gmail/callback", params={"error": "access_denied"}, follow_redirects=False)
        assert resp.status_code in (302, 307)
        assert "integration_error=denied" in resp.headers["location"]

    def test_invalid_state_rejected(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/gmail/callback",
            params={"code": "abc123", "state": "garbage"},
            follow_redirects=False,
        )
        assert "integration_error=invalid_state" in resp.headers["location"]

    def test_successful_connect_creates_the_row_and_shows_up_in_status(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        headers, state = self._state_for(client, org_name="Real Connect Co", email="owner@realconnect.co")

        monkeypatch.setattr(
            gmail_oauth,
            "exchange_code_for_tokens",
            lambda _code: GmailTokens(
                access_token="fake-access", refresh_token="fake-refresh",
                expires_at=datetime.now(UTC) + timedelta(hours=1), scope=gmail_oauth.SCOPES,
            ),
        )
        monkeypatch.setattr(gmail_oauth, "fetch_account_email", lambda _token: "owner@realconnect.co")

        resp = client.get(
            "/api/v1/integrations/gmail/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "connected=gmail" in resp.headers["location"]

        status_resp = client.get("/api/v1/integrations", headers=headers)
        gmail_row = next(r for r in status_resp.json() if r["provider"] == "gmail")
        assert gmail_row["connected"] is True
        assert gmail_row["account_email"] == "owner@realconnect.co"

    def test_exchange_failure_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        _, state = self._state_for(client, org_name="Fails Co", email="owner@fails.co")

        def _boom(_code: str):
            raise GmailOAuthError("Google said no")

        monkeypatch.setattr(gmail_oauth, "exchange_code_for_tokens", _boom)

        resp = client.get(
            "/api/v1/integrations/gmail/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "integration_error=exchange_failed" in resp.headers["location"]


class TestGmailDisconnect:
    def _connect(self, client: TestClient, headers: dict, monkeypatch: pytest.MonkeyPatch, *, email: str) -> None:
        authorize = client.get("/api/v1/integrations/gmail/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        monkeypatch.setattr(
            gmail_oauth,
            "exchange_code_for_tokens",
            lambda _code: GmailTokens(
                access_token="fake-access", refresh_token="fake-refresh",
                expires_at=datetime.now(UTC) + timedelta(hours=1), scope=gmail_oauth.SCOPES,
            ),
        )
        monkeypatch.setattr(gmail_oauth, "fetch_account_email", lambda _token: email)
        monkeypatch.setattr(gmail_oauth, "revoke_token", lambda _token: None)
        client.get("/api/v1/integrations/gmail/callback", params={"code": "abc123", "state": state}, follow_redirects=False)

    def test_requires_owner_or_admin(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="Disc Co", email="owner@disc.co")
        headers = _auth_headers(auth["access_token"])
        self._connect(client, headers, monkeypatch, email="owner@disc.co")

        client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": "member@disc.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@disc.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.post("/api/v1/integrations/gmail/disconnect", headers=member_headers)
        assert resp.status_code == 403

    def test_owner_can_disconnect(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="Real Disc Co", email="owner@realdisc.co")
        headers = _auth_headers(auth["access_token"])
        self._connect(client, headers, monkeypatch, email="owner@realdisc.co")

        resp = client.post("/api/v1/integrations/gmail/disconnect", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"disconnected": True}

        status_resp = client.get("/api/v1/integrations", headers=headers)
        gmail_row = next(r for r in status_resp.json() if r["provider"] == "gmail")
        assert gmail_row["connected"] is False

    def test_disconnecting_nothing_is_a_no_op(self, client: TestClient):
        auth = _register(client, org_name="Never Connected Co", email="owner@never.co")
        resp = client.post(
            "/api/v1/integrations/gmail/disconnect", headers=_auth_headers(auth["access_token"])
        )
        assert resp.status_code == 200
        assert resp.json() == {"disconnected": False}


class TestGetValidGmailAccessToken:
    def test_fresh_token_is_returned_without_refreshing(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="gmail",
                external_account_email="rep@co.com",
                access_token_encrypted=encrypt_token("still-fresh"),
                refresh_token_encrypted=encrypt_token("refresh-me"),
                token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

        def _should_not_be_called(_refresh_token: str):
            raise AssertionError("refresh_access_token must not be called for a fresh token")

        monkeypatch.setattr(gmail_oauth, "refresh_access_token", _should_not_be_called)

        result = IntegrationsService(session).get_valid_gmail_access_token(org_id)
        assert result == ("still-fresh", "rep@co.com")

    def test_expired_token_is_refreshed_and_persisted(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="gmail",
                external_account_email="rep@co.com",
                access_token_encrypted=encrypt_token("stale"),
                refresh_token_encrypted=encrypt_token("refresh-me"),
                token_expires_at=datetime.now(UTC) - timedelta(minutes=5),
            )
        )
        session.commit()

        monkeypatch.setattr(
            gmail_oauth,
            "refresh_access_token",
            lambda _refresh_token: GmailTokens(
                access_token="brand-new", refresh_token=None,
                expires_at=datetime.now(UTC) + timedelta(hours=1), scope=gmail_oauth.SCOPES,
            ),
        )

        access_token, from_address = IntegrationsService(session).get_valid_gmail_access_token(org_id)
        assert access_token == "brand-new"
        assert from_address == "rep@co.com"

        stored = IntegrationsService(session).get_connection(org_id, "gmail")
        assert decrypt_token(stored.access_token_encrypted) == "brand-new"
        assert stored.last_error is None

    def test_refresh_failure_sets_last_error_and_returns_none(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="gmail",
                external_account_email="rep@co.com",
                access_token_encrypted=encrypt_token("stale"),
                refresh_token_encrypted=encrypt_token("revoked-refresh"),
                token_expires_at=datetime.now(UTC) - timedelta(minutes=5),
            )
        )
        session.commit()

        def _boom(_refresh_token: str):
            raise GmailOAuthError("refresh token revoked")

        monkeypatch.setattr(gmail_oauth, "refresh_access_token", _boom)

        result = IntegrationsService(session).get_valid_gmail_access_token(org_id)
        assert result is None

        stored = IntegrationsService(session).get_connection(org_id, "gmail")
        assert stored.last_error == "refresh token revoked"

    def test_no_connection_returns_none(self, session: Session):
        assert IntegrationsService(session).get_valid_gmail_access_token(uuid.uuid4()) is None


class TestLinkedInAuthorize:
    def test_requires_owner_or_admin(self, client: TestClient):
        auth = _register(client, org_name="LI Locked Co", email="owner@lilocked.co")
        owner_headers = _auth_headers(auth["access_token"])
        client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={"email": "member@lilocked.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@lilocked.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.get("/api/v1/integrations/linkedin/authorize", headers=member_headers)
        assert resp.status_code == 403

    def test_503_when_linkedin_oauth_not_configured(self, client: TestClient):
        app_settings.LINKEDIN_OAUTH_CLIENT_ID = None
        auth = _register(client, org_name="No LI Co", email="owner@noli.co")
        resp = client.get("/api/v1/integrations/linkedin/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 503

    def test_owner_gets_a_state_carrying_authorize_url(self, client: TestClient):
        auth = _register(client, org_name="LI Connect Co", email="owner@liconnect.co")
        resp = client.get("/api/v1/integrations/linkedin/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        url = resp.json()["authorize_url"]
        assert url.startswith("https://www.linkedin.com/oauth/v2/authorization?")
        assert "state=" in url
        assert "scope=" in url


class TestLinkedInCallback:
    def _state_for(self, client: TestClient, *, org_name: str, email: str) -> tuple[dict, str]:
        auth = _register(client, org_name=org_name, email=email)
        headers = _auth_headers(auth["access_token"])
        authorize = client.get("/api/v1/integrations/linkedin/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        return headers, state

    def test_user_denied_consent(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/linkedin/callback", params={"error": "user_cancelled_login"}, follow_redirects=False
        )
        assert resp.status_code in (302, 307)
        assert "integration_error=denied" in resp.headers["location"]

    def test_invalid_state_rejected(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/linkedin/callback",
            params={"code": "abc123", "state": "garbage"},
            follow_redirects=False,
        )
        assert "integration_error=invalid_state" in resp.headers["location"]

    def test_a_gmail_state_token_cannot_be_replayed_against_linkedin(self, client: TestClient):
        """The purpose claim keeps one provider's state token from being
        replayed against the other's callback — not just any signed token."""
        auth = _register(client, org_name="Swap Provider Co", email="owner@swapprovider.co")
        headers = _auth_headers(auth["access_token"])
        gmail_authorize = client.get("/api/v1/integrations/gmail/authorize", headers=headers)
        gmail_state = gmail_authorize.json()["authorize_url"].split("state=")[1].split("&")[0]

        resp = client.get(
            "/api/v1/integrations/linkedin/callback",
            params={"code": "abc123", "state": gmail_state},
            follow_redirects=False,
        )
        assert "integration_error=invalid_state" in resp.headers["location"]

    def test_successful_connect_creates_the_row_and_shows_up_in_status(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        headers, state = self._state_for(client, org_name="Real LI Connect Co", email="owner@realliconnect.co")

        monkeypatch.setattr(
            linkedin_oauth,
            "exchange_code_for_tokens",
            lambda _code: LinkedInTokens(
                access_token="fake-li-access", refresh_token=None,
                expires_at=datetime.now(UTC) + timedelta(days=60), scope=linkedin_oauth.SCOPES,
            ),
        )
        monkeypatch.setattr(linkedin_oauth, "fetch_account_info", lambda _token: "owner@realliconnect.co")

        resp = client.get(
            "/api/v1/integrations/linkedin/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "connected=linkedin" in resp.headers["location"]

        status_resp = client.get("/api/v1/integrations", headers=headers)
        li_row = next(r for r in status_resp.json() if r["provider"] == "linkedin")
        assert li_row["connected"] is True
        assert li_row["account_email"] == "owner@realliconnect.co"

    def test_exchange_failure_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        _, state = self._state_for(client, org_name="LI Fails Co", email="owner@lifails.co")

        def _boom(_code: str):
            raise LinkedInOAuthError("LinkedIn said no")

        monkeypatch.setattr(linkedin_oauth, "exchange_code_for_tokens", _boom)

        resp = client.get(
            "/api/v1/integrations/linkedin/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "integration_error=exchange_failed" in resp.headers["location"]


class TestLinkedInDisconnect:
    def _connect(self, client: TestClient, headers: dict, monkeypatch: pytest.MonkeyPatch, *, email: str) -> None:
        authorize = client.get("/api/v1/integrations/linkedin/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        monkeypatch.setattr(
            linkedin_oauth,
            "exchange_code_for_tokens",
            lambda _code: LinkedInTokens(
                access_token="fake-li-access", refresh_token=None,
                expires_at=datetime.now(UTC) + timedelta(days=60), scope=linkedin_oauth.SCOPES,
            ),
        )
        monkeypatch.setattr(linkedin_oauth, "fetch_account_info", lambda _token: email)
        client.get(
            "/api/v1/integrations/linkedin/callback", params={"code": "abc123", "state": state}, follow_redirects=False
        )

    def test_requires_owner_or_admin(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="LI Disc Co", email="owner@lidisc.co")
        headers = _auth_headers(auth["access_token"])
        self._connect(client, headers, monkeypatch, email="owner@lidisc.co")

        client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": "member@lidisc.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@lidisc.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.post("/api/v1/integrations/linkedin/disconnect", headers=member_headers)
        assert resp.status_code == 403

    def test_owner_can_disconnect_without_a_revoke_call(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Unlike Gmail, disconnect must succeed with zero network calls —
        LinkedIn has no revoke endpoint to call (see linkedin_oauth's module
        docstring); this test would fail loudly if disconnect() ever grew
        an unconditional revoke attempt for a provider that doesn't support it."""
        auth = _register(client, org_name="Real LI Disc Co", email="owner@reallidisc.co")
        headers = _auth_headers(auth["access_token"])
        self._connect(client, headers, monkeypatch, email="owner@reallidisc.co")

        resp = client.post("/api/v1/integrations/linkedin/disconnect", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"disconnected": True}

        status_resp = client.get("/api/v1/integrations", headers=headers)
        li_row = next(r for r in status_resp.json() if r["provider"] == "linkedin")
        assert li_row["connected"] is False

    def test_disconnecting_nothing_is_a_no_op(self, client: TestClient):
        auth = _register(client, org_name="LI Never Connected Co", email="owner@linever.co")
        resp = client.post(
            "/api/v1/integrations/linkedin/disconnect", headers=_auth_headers(auth["access_token"])
        )
        assert resp.status_code == 200
        assert resp.json() == {"disconnected": False}


class TestGetValidLinkedInAccessToken:
    def test_fresh_token_is_returned_without_refreshing(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="linkedin",
                external_account_email="rep@co.com",
                access_token_encrypted=encrypt_token("still-fresh"),
                refresh_token_encrypted=encrypt_token("refresh-me"),
                token_expires_at=datetime.now(UTC) + timedelta(days=30),
            )
        )
        session.commit()

        def _should_not_be_called(_refresh_token: str):
            raise AssertionError("refresh_access_token must not be called for a fresh token")

        monkeypatch.setattr(linkedin_oauth, "refresh_access_token", _should_not_be_called)

        result = IntegrationsService(session).get_valid_linkedin_access_token(org_id)
        assert result == ("still-fresh", "rep@co.com")

    def test_no_refresh_token_sets_last_error_and_returns_none(self, session: Session):
        """The common LinkedIn case: no refresh_token was ever issued (app
        not approved for it). Once the access token expires, the row must
        surface "reconecta" rather than silently keep returning a stale
        (and now-rejected) token."""
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="linkedin",
                external_account_email="rep@co.com",
                access_token_encrypted=encrypt_token("expired"),
                refresh_token_encrypted=None,
                token_expires_at=datetime.now(UTC) - timedelta(minutes=5),
            )
        )
        session.commit()

        result = IntegrationsService(session).get_valid_linkedin_access_token(org_id)
        assert result is None

        stored = IntegrationsService(session).get_connection(org_id, "linkedin")
        assert stored.last_error is not None

    def test_expired_token_is_refreshed_and_persisted(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="linkedin",
                external_account_email="rep@co.com",
                access_token_encrypted=encrypt_token("stale"),
                refresh_token_encrypted=encrypt_token("refresh-me"),
                token_expires_at=datetime.now(UTC) - timedelta(minutes=5),
            )
        )
        session.commit()

        monkeypatch.setattr(
            linkedin_oauth,
            "refresh_access_token",
            lambda _refresh_token: LinkedInTokens(
                access_token="brand-new-li", refresh_token=None,
                expires_at=datetime.now(UTC) + timedelta(days=60), scope=linkedin_oauth.SCOPES,
            ),
        )

        access_token, account_label = IntegrationsService(session).get_valid_linkedin_access_token(org_id)
        assert access_token == "brand-new-li"
        assert account_label == "rep@co.com"

        stored = IntegrationsService(session).get_connection(org_id, "linkedin")
        assert decrypt_token(stored.access_token_encrypted) == "brand-new-li"
        assert stored.last_error is None

    def test_no_connection_returns_none(self, session: Session):
        assert IntegrationsService(session).get_valid_linkedin_access_token(uuid.uuid4()) is None


class TestSalesforceAuthorize:
    def test_requires_owner_or_admin(self, client: TestClient):
        auth = _register(client, org_name="SF Locked Co", email="owner@sflocked.co")
        owner_headers = _auth_headers(auth["access_token"])
        client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={"email": "member@sflocked.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post("/api/v1/auth/login", json={"email": "member@sflocked.co", "password": "password123"})
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.get("/api/v1/integrations/salesforce/authorize", headers=member_headers)
        assert resp.status_code == 403

    def test_503_when_salesforce_oauth_not_configured(self, client: TestClient):
        app_settings.SALESFORCE_OAUTH_CLIENT_ID = None
        auth = _register(client, org_name="No SF Co", email="owner@nosf.co")
        resp = client.get("/api/v1/integrations/salesforce/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 503

    def test_owner_gets_a_state_carrying_authorize_url(self, client: TestClient):
        auth = _register(client, org_name="SF Connect Co", email="owner@sfconnect.co")
        resp = client.get("/api/v1/integrations/salesforce/authorize", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        url = resp.json()["authorize_url"]
        assert url.startswith("https://login.salesforce.com/services/oauth2/authorize?")
        assert "state=" in url

    def test_respects_a_sandbox_login_url(self, client: TestClient):
        app_settings.SALESFORCE_LOGIN_URL = "https://test.salesforce.com"
        auth = _register(client, org_name="SF Sandbox Co", email="owner@sfsandbox.co")
        resp = client.get("/api/v1/integrations/salesforce/authorize", headers=_auth_headers(auth["access_token"]))
        app_settings.SALESFORCE_LOGIN_URL = "https://login.salesforce.com"
        assert resp.json()["authorize_url"].startswith("https://test.salesforce.com/services/oauth2/authorize?")


class TestSalesforceCallback:
    def _state_for(self, client: TestClient, *, org_name: str, email: str) -> tuple[dict, str]:
        auth = _register(client, org_name=org_name, email=email)
        headers = _auth_headers(auth["access_token"])
        authorize = client.get("/api/v1/integrations/salesforce/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        return headers, state

    def test_user_denied_consent(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/salesforce/callback", params={"error": "access_denied"}, follow_redirects=False
        )
        assert resp.status_code in (302, 307)
        assert "integration_error=denied" in resp.headers["location"]

    def test_invalid_state_rejected(self, client: TestClient):
        resp = client.get(
            "/api/v1/integrations/salesforce/callback",
            params={"code": "abc123", "state": "garbage"},
            follow_redirects=False,
        )
        assert "integration_error=invalid_state" in resp.headers["location"]

    def test_successful_connect_creates_the_row_with_instance_url(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        headers, state = self._state_for(client, org_name="Real SF Connect Co", email="owner@realsfconnect.co")

        monkeypatch.setattr(
            salesforce_oauth,
            "exchange_code_for_tokens",
            lambda _code: SalesforceTokens(
                access_token="fake-sf-access", refresh_token="fake-sf-refresh",
                instance_url="https://realsfconnect.my.salesforce.com",
                scope=salesforce_oauth.SCOPES, expires_at=datetime.now(UTC) + timedelta(hours=2),
            ),
        )

        resp = client.get(
            "/api/v1/integrations/salesforce/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "connected=salesforce" in resp.headers["location"]

        status_resp = client.get("/api/v1/integrations", headers=headers)
        sf_row = next(r for r in status_resp.json() if r["provider"] == "salesforce")
        assert sf_row["connected"] is True
        assert sf_row["account_email"] == "realsfconnect.my.salesforce.com"

    def test_exchange_failure_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        _, state = self._state_for(client, org_name="SF Fails Co", email="owner@sffails.co")

        def _boom(_code: str):
            raise SalesforceOAuthError("Salesforce said no")

        monkeypatch.setattr(salesforce_oauth, "exchange_code_for_tokens", _boom)

        resp = client.get(
            "/api/v1/integrations/salesforce/callback",
            params={"code": "abc123", "state": state},
            follow_redirects=False,
        )
        assert "integration_error=exchange_failed" in resp.headers["location"]


class TestSalesforceDisconnect:
    def test_owner_can_disconnect(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="Real SF Disc Co", email="owner@realsfdisc.co")
        headers = _auth_headers(auth["access_token"])

        authorize = client.get("/api/v1/integrations/salesforce/authorize", headers=headers)
        state = authorize.json()["authorize_url"].split("state=")[1].split("&")[0]
        monkeypatch.setattr(
            salesforce_oauth,
            "exchange_code_for_tokens",
            lambda _code: SalesforceTokens(
                access_token="fake-sf-access", refresh_token="fake-sf-refresh",
                instance_url="https://realsfdisc.my.salesforce.com",
                scope=salesforce_oauth.SCOPES, expires_at=datetime.now(UTC) + timedelta(hours=2),
            ),
        )
        client.get(
            "/api/v1/integrations/salesforce/callback", params={"code": "abc123", "state": state}, follow_redirects=False
        )

        resp = client.post("/api/v1/integrations/salesforce/disconnect", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"disconnected": True}

        status_resp = client.get("/api/v1/integrations", headers=headers)
        sf_row = next(r for r in status_resp.json() if r["provider"] == "salesforce")
        assert sf_row["connected"] is False


class TestGetValidSalesforceAccessToken:
    def test_returns_instance_url_not_an_email(self, session: Session):
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="salesforce",
                external_account_email="myorg.my.salesforce.com",
                instance_url="https://myorg.my.salesforce.com",
                access_token_encrypted=encrypt_token("still-fresh"),
                refresh_token_encrypted=encrypt_token("refresh-me"),
                token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

        result = IntegrationsService(session).get_valid_salesforce_access_token(org_id)
        assert result == ("still-fresh", "https://myorg.my.salesforce.com")

    def test_refresh_keeps_the_previous_refresh_token_when_response_omits_one(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ):
        """Salesforce's refresh response doesn't echo refresh_token back —
        confirms salesforce_oauth.refresh_access_token itself preserves the
        one it was called with (see that function's own comment), so a
        second refresh later still has one to use."""
        org_id = uuid.uuid4()
        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="salesforce",
                external_account_email="myorg.my.salesforce.com",
                instance_url="https://myorg.my.salesforce.com",
                access_token_encrypted=encrypt_token("stale"),
                refresh_token_encrypted=encrypt_token("long-lived-refresh"),
                token_expires_at=datetime.now(UTC) - timedelta(minutes=5),
            )
        )
        session.commit()

        import httpx

        class _FakeResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                # Deliberately omits "refresh_token", matching Salesforce's
                # real behavior.
                return {
                    "access_token": "brand-new-sf",
                    "instance_url": "https://myorg.my.salesforce.com",
                    "scope": salesforce_oauth.SCOPES,
                }

        monkeypatch.setattr(httpx, "post", lambda *_args, **_kwargs: _FakeResponse())

        access_token, instance_url = IntegrationsService(session).get_valid_salesforce_access_token(org_id)
        assert access_token == "brand-new-sf"
        assert instance_url == "https://myorg.my.salesforce.com"

        stored = IntegrationsService(session).get_connection(org_id, "salesforce")
        assert decrypt_token(stored.refresh_token_encrypted) == "long-lived-refresh"

    def test_no_connection_returns_none(self, session: Session):
        assert IntegrationsService(session).get_valid_salesforce_access_token(uuid.uuid4()) is None
