"""Tests for enterprise SSO — PATCH/GET /organizations/me/sso,
POST /auth/sso/lookup, GET /auth/sso/callback. See
app.services.sso and app.api.v1.endpoints.sso for the design.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api.v1.endpoints import sso as sso_endpoint
from app.core.config import settings as app_settings
from app.core.security import create_access_token
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.sso.service import SSOProfile


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
def _workos_configured():
    originals = (app_settings.WORKOS_API_KEY, app_settings.WORKOS_CLIENT_ID, app_settings.WORKOS_REDIRECT_URI)
    app_settings.WORKOS_API_KEY = "sk_test_workos"
    app_settings.WORKOS_CLIENT_ID = "client_test_workos"
    app_settings.WORKOS_REDIRECT_URI = "http://localhost:8000/api/v1/auth/sso/callback"
    yield
    (app_settings.WORKOS_API_KEY, app_settings.WORKOS_CLIENT_ID, app_settings.WORKOS_REDIRECT_URI) = originals


class TestSSOConfigEndpoint:
    def test_member_cannot_read_sso_config(self, client: TestClient, session: Session):
        auth = _register(client, org_name="SSO Locked Co", email="owner@ssolocked.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        member = User(
            organization_id=org_id, email="member@ssolocked.co", hashed_password="x",
            full_name="Member", role=UserRole.MEMBER,
        )
        session.add(member)
        session.commit()
        token = create_access_token(member.id, organization_id=org_id, role=member.role.value)

        resp = client.get("/api/v1/organizations/me/sso", headers=_auth_headers(token))
        assert resp.status_code == 403

    def test_admin_cannot_write_sso_config_owner_only(self, client: TestClient, session: Session):
        auth = _register(client, org_name="SSO Admin Co", email="owner@ssoadmin.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        admin = User(
            organization_id=org_id, email="admin@ssoadmin.co", hashed_password="x",
            full_name="Admin", role=UserRole.ADMIN,
        )
        session.add(admin)
        session.commit()
        token = create_access_token(admin.id, organization_id=org_id, role=admin.role.value)

        resp = client.patch(
            "/api/v1/organizations/me/sso", json={"sso_enabled": True}, headers=_auth_headers(token)
        )
        assert resp.status_code == 403

    def test_default_sso_config_is_off(self, client: TestClient):
        auth = _register(client, org_name="SSO Default Co", email="owner@ssodefault.co")
        resp = client.get("/api/v1/organizations/me/sso", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        body = resp.json()
        assert body == {
            "sso_enabled": False,
            "sso_connection_id": None,
            "sso_domain": None,
            "globally_configured": True,
        }

    def test_owner_can_configure_and_it_is_audit_logged(self, client: TestClient, session: Session):
        auth = _register(client, org_name="SSO Configurable Co", email="owner@ssoconfigurable.co")
        resp = client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_enabled": True, "sso_connection_id": "conn_abc123", "sso_domain": "ssoconfigurable.co"},
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["sso_enabled"] is True
        assert body["sso_connection_id"] == "conn_abc123"
        assert body["sso_domain"] == "ssoconfigurable.co"

        org_id = uuid.UUID(auth["user"]["organization_id"])
        org = session.get(Organization, org_id)
        assert org is not None
        assert org.sso_enabled is True
        assert org.sso_connection_id == "conn_abc123"

        from app.services.admin_audit import AdminAuditService

        entries = AdminAuditService(session).list_entries(
            organization_id=org_id, action="organization.sso_config_updated"
        )
        assert len(entries) == 1

    def test_partial_patch_does_not_clear_unset_fields(self, client: TestClient):
        auth = _register(client, org_name="SSO Partial Co", email="owner@ssopartial.co")
        client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_connection_id": "conn_xyz", "sso_domain": "ssopartial.co"},
            headers=_auth_headers(auth["access_token"]),
        )
        resp = client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_enabled": True},
            headers=_auth_headers(auth["access_token"]),
        )
        body = resp.json()
        assert body["sso_enabled"] is True
        assert body["sso_connection_id"] == "conn_xyz"
        assert body["sso_domain"] == "ssopartial.co"


class TestSSOLookup:
    def test_unknown_domain_reports_unavailable(self, client: TestClient):
        resp = client.post("/api/v1/auth/sso/lookup", json={"email": "person@nowhere-configured.example"})
        assert resp.status_code == 200
        assert resp.json() == {"sso_available": False, "authorize_url": None}

    def test_org_with_sso_disabled_reports_unavailable(self, client: TestClient):
        auth = _register(client, org_name="SSO Off Co", email="owner@ssooff.co")
        client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_connection_id": "conn_off", "sso_domain": "ssooff.co"},
            headers=_auth_headers(auth["access_token"]),
        )
        resp = client.post("/api/v1/auth/sso/lookup", json={"email": "someone@ssooff.co"})
        assert resp.json() == {"sso_available": False, "authorize_url": None}

    def test_org_with_sso_enabled_reports_authorize_url(self, client: TestClient):
        auth = _register(client, org_name="SSO On Co", email="owner@ssoon.co")
        client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_enabled": True, "sso_connection_id": "conn_on", "sso_domain": "ssoon.co"},
            headers=_auth_headers(auth["access_token"]),
        )
        resp = client.post("/api/v1/auth/sso/lookup", json={"email": "someone@ssoon.co"})
        body = resp.json()
        assert body["sso_available"] is True
        assert body["authorize_url"] is not None
        assert "conn_on" in body["authorize_url"]

    def test_globally_unconfigured_reports_unavailable_even_if_org_enabled(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        auth = _register(client, org_name="SSO Global Off Co", email="owner@ssoglobaloff.co")
        client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_enabled": True, "sso_connection_id": "conn_go", "sso_domain": "ssoglobaloff.co"},
            headers=_auth_headers(auth["access_token"]),
        )
        monkeypatch.setattr(app_settings, "WORKOS_API_KEY", None)
        resp = client.post("/api/v1/auth/sso/lookup", json={"email": "someone@ssoglobaloff.co"})
        assert resp.json() == {"sso_available": False, "authorize_url": None}


class TestSSOCallback:
    def test_exchange_failure_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        def _boom(_code: str):
            raise sso_endpoint.SSOError("nope")

        monkeypatch.setattr(sso_endpoint, "exchange_code_for_profile", _boom)
        resp = client.get("/api/v1/auth/sso/callback?code=bad-code", follow_redirects=False)
        assert resp.status_code in (302, 307)
        assert "sso_error=exchange_failed" in resp.headers["location"]

    def test_unknown_connection_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(
            sso_endpoint,
            "exchange_code_for_profile",
            lambda _code: SSOProfile(email="nobody@nowhere.co", connection_id="conn_nonexistent"),
        )
        resp = client.get("/api/v1/auth/sso/callback?code=good-code", follow_redirects=False)
        assert "sso_error=unknown_connection" in resp.headers["location"]

    def test_no_matching_account_redirects_with_error(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="SSO NoAccount Co", email="owner@ssonoaccount.co")
        client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_enabled": True, "sso_connection_id": "conn_noacct", "sso_domain": "ssonoaccount.co"},
            headers=_auth_headers(auth["access_token"]),
        )
        monkeypatch.setattr(
            sso_endpoint,
            "exchange_code_for_profile",
            lambda _code: SSOProfile(email="stranger@ssonoaccount.co", connection_id="conn_noacct"),
        )
        resp = client.get("/api/v1/auth/sso/callback?code=good-code", follow_redirects=False)
        assert "sso_error=no_account" in resp.headers["location"]

    def test_matching_account_issues_a_session_token(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        auth = _register(client, org_name="SSO Success Co", email="owner@ssosuccess.co")
        client.patch(
            "/api/v1/organizations/me/sso",
            json={"sso_enabled": True, "sso_connection_id": "conn_success", "sso_domain": "ssosuccess.co"},
            headers=_auth_headers(auth["access_token"]),
        )
        monkeypatch.setattr(
            sso_endpoint,
            "exchange_code_for_profile",
            lambda _code: SSOProfile(email="owner@ssosuccess.co", connection_id="conn_success"),
        )
        resp = client.get("/api/v1/auth/sso/callback?code=good-code", follow_redirects=False)
        location = resp.headers["location"]
        assert "#sso_token=" in location
        token = location.split("#sso_token=", 1)[1]

        me_resp = client.get("/api/v1/auth/me", headers=_auth_headers(token))
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "owner@ssosuccess.co"
