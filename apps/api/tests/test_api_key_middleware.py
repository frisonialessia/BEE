"""Regression tests for APIKeyMiddleware x CORSMiddleware interaction.

Every test in the rest of this suite runs with ``API_SECRET_KEY`` unset (see
``conftest.client_fixture``), which disables APIKeyMiddleware entirely — so
none of them ever exercised its interaction with CORS, or its exempt-path
list. That gap is exactly how production shipped with a bug where a CORS
pre-flight OPTIONS request to ``/auth/register`` got 401'd by APIKeyMiddleware
before CORSMiddleware ever got to answer it, silently breaking every
cross-origin call — including the public signup flow — the moment
``API_SECRET_KEY`` was configured. See the fix commits for the full story.

These tests build their own app instance with ``API_SECRET_KEY`` actually
set, so this interaction is under CI from now on.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.database import get_session
from app.core.signup_guard import reset_signup_guard
from app.main import create_app

TEST_API_KEY = "test-api-key-for-middleware-regression-tests"
TEST_ORIGIN = "https://bee-web-test.vercel.app"


@pytest.fixture(name="keyed_client")
def keyed_client_fixture(engine) -> Generator[TestClient, None, None]:
    """A TestClient with API_SECRET_KEY *actually set* — unlike ``client``."""

    def _get_session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    original_key = app_settings.API_SECRET_KEY
    original_cors = app_settings.BACKEND_CORS_ORIGINS
    original_webhook_required = app_settings.WEBHOOK_SIGNATURE_REQUIRED
    app_settings.API_SECRET_KEY = TEST_API_KEY
    app_settings.BACKEND_CORS_ORIGINS = TEST_ORIGIN
    app_settings.WEBHOOK_SIGNATURE_REQUIRED = False
    reset_signup_guard()
    try:
        app = create_app()
        app.dependency_overrides[get_session] = _get_session_override
        with TestClient(app) as client:
            yield client
    finally:
        app_settings.API_SECRET_KEY = original_key
        app_settings.BACKEND_CORS_ORIGINS = original_cors
        app_settings.WEBHOOK_SIGNATURE_REQUIRED = original_webhook_required


def _preflight_headers() -> dict[str, str]:
    """Headers a real browser sends on a CORS pre-flight — no X-API-Key."""
    return {
        "Origin": TEST_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-api-key",
    }


class TestPreflightNeverNeedsApiKey:
    """A CORS pre-flight OPTIONS request must never require X-API-Key —
    browsers never attach custom headers to one, by spec."""

    def test_preflight_on_register_succeeds_without_key(self, keyed_client: TestClient) -> None:
        resp = keyed_client.options("/api/v1/auth/register", headers=_preflight_headers())
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == TEST_ORIGIN

    def test_preflight_on_a_protected_endpoint_also_succeeds_without_key(
        self, keyed_client: TestClient
    ) -> None:
        """Not just the exempt auth routes — CORSMiddleware must be able to
        answer *any* pre-flight before APIKeyMiddleware sees it, or every
        cross-origin call to the app breaks, not just signup/login."""
        resp = keyed_client.options("/api/v1/leads", headers=_preflight_headers())
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == TEST_ORIGIN


class TestPublicAuthEndpointsAreOpen:
    """/auth/register and /auth/login are self-serve entry points — no
    X-API-Key required, ever, regardless of whether API_SECRET_KEY is set."""

    def test_register_succeeds_without_x_api_key(self, keyed_client: TestClient) -> None:
        resp = keyed_client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Regression Test Co",
                "full_name": "Reg Test",
                "email": "regression-test@example.com",
                "password": "supersecret123",
            },
        )
        assert resp.status_code == 201, resp.text
        assert "access_token" in resp.json()

    def test_login_succeeds_without_x_api_key(self, keyed_client: TestClient) -> None:
        register = keyed_client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Login Regression Co",
                "full_name": "Login Test",
                "email": "login-regression-test@example.com",
                "password": "supersecret123",
            },
        )
        assert register.status_code == 201, register.text

        login = keyed_client.post(
            "/api/v1/auth/login",
            json={"email": "login-regression-test@example.com", "password": "supersecret123"},
        )
        assert login.status_code == 200, login.text
        assert "access_token" in login.json()


class TestOtherEndpointsStillRequireTheKey:
    """The exemption must stay narrow — everything else still needs
    X-API-Key when API_SECRET_KEY is configured."""

    def test_protected_endpoint_401s_without_key(self, keyed_client: TestClient) -> None:
        resp = keyed_client.get("/api/v1/leads")
        assert resp.status_code == 401

    def test_protected_endpoint_passes_the_key_check_with_correct_key(
        self, keyed_client: TestClient
    ) -> None:
        # Wrong JWT/org context still applies past this point — the point
        # here is only that APIKeyMiddleware itself lets it through.
        resp = keyed_client.get("/api/v1/leads", headers={"X-API-Key": TEST_API_KEY})
        assert resp.status_code != 401 or "Missing API key" not in resp.text

    def test_health_and_ready_stay_exempt(self, keyed_client: TestClient) -> None:
        assert keyed_client.get("/api/v1/health").status_code == 200
        assert keyed_client.get("/api/v1/ready").status_code == 200


def test_blank_api_secret_key_disables_the_middleware(monkeypatch: pytest.MonkeyPatch) -> None:
    """``API_SECRET_KEY=`` (the blank line ``.env.example`` and docker-compose
    ship) must mean "auth disabled", same as the variable being absent.

    Regression: pydantic-settings reads a blank line as ``""``, and the
    middleware gated on ``is not None`` — so the documented local setup
    enabled auth with an empty secret and 401'd every dashboard request.
    """
    from app.core.config import Settings

    monkeypatch.setenv("API_SECRET_KEY", "")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "   ")
    fresh = Settings(_env_file=None)
    assert fresh.API_SECRET_KEY is None
    assert fresh.GOOGLE_OAUTH_CLIENT_ID is None
    # Non-optional strings are left alone — blank stays blank, never None.
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", "")
    assert Settings(_env_file=None).BACKEND_CORS_ORIGINS == ""
