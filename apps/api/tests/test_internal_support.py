"""Tests for the internal support password-reset tool (BEE team only).

See app.api.v1.endpoints.internal_support for the full rationale — one
narrow emergency action, gated by its own secret, off by default.
"""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org_name,
            "full_name": "Owner",
            "email": email,
            "password": password,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestSupportPasswordReset:
    def test_disabled_by_default_returns_404(self, client: TestClient):
        resp = client.post(
            "/api/v1/internal/support/reset-password",
            json={"email": "anyone@acme.io"},
            headers={"X-BEE-Support-Secret": "whatever"},
        )
        assert resp.status_code == 404

    def test_missing_secret_rejected_when_enabled(self, client: TestClient):
        from app.core.config import settings as app_settings

        _register(client, org_name="Acme Corp", email="support1@acme.io")
        with patch.object(app_settings, "SUPPORT_ADMIN_SECRET", "super-secret-value"):
            resp = client.post(
                "/api/v1/internal/support/reset-password",
                json={"email": "support1@acme.io"},
            )
        assert resp.status_code == 401

    def test_wrong_secret_rejected(self, client: TestClient):
        from app.core.config import settings as app_settings

        _register(client, org_name="Acme Corp", email="support2@acme.io")
        with patch.object(app_settings, "SUPPORT_ADMIN_SECRET", "super-secret-value"):
            resp = client.post(
                "/api/v1/internal/support/reset-password",
                json={"email": "support2@acme.io"},
                headers={"X-BEE-Support-Secret": "not-it"},
            )
        assert resp.status_code == 401

    def test_unknown_email_returns_404(self, client: TestClient):
        from app.core.config import settings as app_settings

        with patch.object(app_settings, "SUPPORT_ADMIN_SECRET", "super-secret-value"):
            resp = client.post(
                "/api/v1/internal/support/reset-password",
                json={"email": "nobody-here@acme.io"},
                headers={"X-BEE-Support-Secret": "super-secret-value"},
            )
        assert resp.status_code == 404

    def test_correct_secret_resets_password_and_old_one_stops_working(self, client: TestClient):
        from app.core.config import settings as app_settings

        _register(client, org_name="Acme Corp", email="support3@acme.io", password="original123")

        with patch.object(app_settings, "SUPPORT_ADMIN_SECRET", "super-secret-value"):
            resp = client.post(
                "/api/v1/internal/support/reset-password",
                json={"email": "support3@acme.io"},
                headers={"X-BEE-Support-Secret": "super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["email"] == "support3@acme.io"
        assert len(body["temporary_password"]) >= 16

        old_login = client.post(
            "/api/v1/auth/login", json={"email": "support3@acme.io", "password": "original123"}
        )
        assert old_login.status_code == 401

        new_login = client.post(
            "/api/v1/auth/login",
            json={"email": "support3@acme.io", "password": body["temporary_password"]},
        )
        assert new_login.status_code == 200

    def test_temporary_passwords_are_not_reused(self, client: TestClient):
        from app.core.config import settings as app_settings

        _register(client, org_name="Acme Corp", email="support4@acme.io")

        with patch.object(app_settings, "SUPPORT_ADMIN_SECRET", "super-secret-value"):
            headers = {"X-BEE-Support-Secret": "super-secret-value"}
            first = client.post(
                "/api/v1/internal/support/reset-password",
                json={"email": "support4@acme.io"},
                headers=headers,
            ).json()
            second = client.post(
                "/api/v1/internal/support/reset-password",
                json={"email": "support4@acme.io"},
                headers=headers,
            ).json()
        assert first["temporary_password"] != second["temporary_password"]
