"""Tests for BACKEND_CORS_ORIGIN_REGEX — the regex-based CORS allow-list
that matches IN ADDITION to BACKEND_CORS_ORIGINS' exact-string list (see
both settings' own docstrings in app.core.config).

Exists for one situation: a Vercel project's frontend is reachable at
several auto-generated aliases at once (production alias, git-branch
alias, per-deployment URL), and enumerating every one by hand in
BACKEND_CORS_ORIGINS means the next alias Vercel generates is silently
CORS-rejected until someone notices. Mirrors test_api_key_middleware.py's
own pattern for building an app instance with non-default CORS settings.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.database import get_session
from app.main import create_app

# Mirrors the real regex recommended for apps/web's own Vercel project in
# .env.example — deliberately the same pattern, not a simplified stand-in.
TEST_REGEX = r"^https://bee-web(-[a-zA-Z0-9]+)*\.vercel\.app$"
EXACT_ORIGIN = "https://app.example.com"


@pytest.fixture(name="regex_client")
def regex_client_fixture(engine) -> Generator[TestClient, None, None]:
    def _get_session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    original_cors = app_settings.BACKEND_CORS_ORIGINS
    original_regex = app_settings.BACKEND_CORS_ORIGIN_REGEX
    app_settings.BACKEND_CORS_ORIGINS = EXACT_ORIGIN
    app_settings.BACKEND_CORS_ORIGIN_REGEX = TEST_REGEX
    try:
        app = create_app()
        app.dependency_overrides[get_session] = _get_session_override
        with TestClient(app) as client:
            yield client
    finally:
        app_settings.BACKEND_CORS_ORIGINS = original_cors
        app_settings.BACKEND_CORS_ORIGIN_REGEX = original_regex


@pytest.fixture(name="no_regex_client")
def no_regex_client_fixture(engine) -> Generator[TestClient, None, None]:
    """BACKEND_CORS_ORIGIN_REGEX left unset (the default) — confirms the
    regex path is a strict addition, never a behavior change on its own."""

    def _get_session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    original_cors = app_settings.BACKEND_CORS_ORIGINS
    original_regex = app_settings.BACKEND_CORS_ORIGIN_REGEX
    app_settings.BACKEND_CORS_ORIGINS = EXACT_ORIGIN
    app_settings.BACKEND_CORS_ORIGIN_REGEX = None
    try:
        app = create_app()
        app.dependency_overrides[get_session] = _get_session_override
        with TestClient(app) as client:
            yield client
    finally:
        app_settings.BACKEND_CORS_ORIGINS = original_cors
        app_settings.BACKEND_CORS_ORIGIN_REGEX = original_regex


def _preflight(origin: str) -> dict[str, str]:
    return {
        "Origin": origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
    }


class TestRegexMatchedOrigins:
    @pytest.mark.parametrize(
        "origin",
        [
            "https://bee-web-theta.vercel.app",
            "https://bee-web-alessiafrisoni.vercel.app",
            "https://bee-web-git-main-alessiafrisoni.vercel.app",
        ],
    )
    def test_vercel_alias_not_in_exact_list_is_allowed_via_regex(
        self, regex_client: TestClient, origin: str
    ) -> None:
        resp = regex_client.options("/api/v1/health", headers=_preflight(origin))
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == origin

    def test_exact_list_origin_still_works_alongside_the_regex(self, regex_client: TestClient) -> None:
        resp = regex_client.options("/api/v1/health", headers=_preflight(EXACT_ORIGIN))
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == EXACT_ORIGIN


class TestRegexScopeIsNarrow:
    @pytest.mark.parametrize(
        "origin",
        [
            # A lookalike prefix, not a real sibling alias of this project.
            "https://evil-bee-web-theta.vercel.app",
            # Suffix-appended attack — the regex must anchor on both ends.
            "https://bee-web-theta.vercel.app.evil.com",
            # A different Vercel project entirely.
            "https://some-other-app.vercel.app",
        ],
    )
    def test_non_matching_origins_get_no_cors_header(self, regex_client: TestClient, origin: str) -> None:
        resp = regex_client.options("/api/v1/health", headers=_preflight(origin))
        assert resp.headers.get("access-control-allow-origin") is None


class TestRegexUnsetIsANoOp:
    def test_vercel_alias_rejected_when_regex_is_unset(self, no_regex_client: TestClient) -> None:
        resp = no_regex_client.options(
            "/api/v1/health", headers=_preflight("https://bee-web-theta.vercel.app")
        )
        assert resp.headers.get("access-control-allow-origin") is None

    def test_exact_list_origin_is_unaffected(self, no_regex_client: TestClient) -> None:
        resp = no_regex_client.options("/api/v1/health", headers=_preflight(EXACT_ORIGIN))
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == EXACT_ORIGIN
