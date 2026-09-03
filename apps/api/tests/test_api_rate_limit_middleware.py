"""Tests for APIRateLimitMiddleware (app.core.middleware) and its guard
(app.core.api_rate_limit_guard) — the general per-IP throttle across the
broad API surface. Same "build a real app with the setting actually set"
approach as test_api_key_middleware.py, since the default limit (300/min)
is deliberately too generous to trip from a handful of test requests.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.api_rate_limit_guard import reset_api_rate_limit_guard
from app.core.config import settings as app_settings
from app.core.database import get_session
from app.main import create_app


@pytest.fixture(name="limited_client")
def limited_client_fixture(engine) -> Generator[TestClient, None, None]:
    """A TestClient with a deliberately tiny per-minute limit."""

    def _get_session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    original_limit = app_settings.API_RATE_LIMIT_PER_MINUTE
    original_exempt = app_settings.API_RATE_LIMIT_EXEMPT_PATHS
    app_settings.API_RATE_LIMIT_PER_MINUTE = 3
    reset_api_rate_limit_guard()
    try:
        app = create_app()
        app.dependency_overrides[get_session] = _get_session_override
        with TestClient(app) as client:
            yield client
    finally:
        app_settings.API_RATE_LIMIT_PER_MINUTE = original_limit
        app_settings.API_RATE_LIMIT_EXEMPT_PATHS = original_exempt
        reset_api_rate_limit_guard()


class TestAPIRateLimitMiddleware:
    def test_allows_requests_under_the_limit(self, limited_client: TestClient):
        for _ in range(3):
            resp = limited_client.get("/")
            assert resp.status_code == 200

    def test_blocks_once_the_limit_is_exceeded(self, limited_client: TestClient):
        for _ in range(3):
            limited_client.get("/")
        resp = limited_client.get("/")
        assert resp.status_code == 429
        assert resp.headers.get("Retry-After") == "60"

    def test_health_endpoint_is_always_exempt(self, limited_client: TestClient):
        for _ in range(10):
            resp = limited_client.get("/api/v1/health")
            assert resp.status_code == 200

    def test_cors_preflight_never_counts_against_the_quota(self, limited_client: TestClient):
        for _ in range(5):
            resp = limited_client.options(
                "/api/v1/auth/login",
                headers={
                    "Origin": "https://example.com",
                    "Access-Control-Request-Method": "POST",
                },
            )
            assert resp.status_code != 429
        # The quota is still fully available for a real request afterwards.
        resp = limited_client.get("/")
        assert resp.status_code == 200

    def test_zero_disables_the_check_entirely(self, engine):
        def _get_session_override() -> Generator[Session, None, None]:
            with Session(engine) as session:
                yield session

        original_limit = app_settings.API_RATE_LIMIT_PER_MINUTE
        app_settings.API_RATE_LIMIT_PER_MINUTE = 0
        reset_api_rate_limit_guard()
        try:
            app = create_app()
            app.dependency_overrides[get_session] = _get_session_override
            with TestClient(app) as client:
                for _ in range(20):
                    assert client.get("/").status_code == 200
        finally:
            app_settings.API_RATE_LIMIT_PER_MINUTE = original_limit
            reset_api_rate_limit_guard()
