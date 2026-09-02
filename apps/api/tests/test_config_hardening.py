"""Tests for Settings._warn_on_production_hardening_gaps.

Covers the loud-CRITICAL-log-not-raise contract for every gap the validator
checks: webhook signature enforcement, placeholder secrets left in place,
and (added in this sweep) a database that was never actually configured —
DATABASE_URL unset and POSTGRES_* still at their local-dev defaults, which
`sqlalchemy_database_uri` would otherwise silently turn into a connection
string pointing at localhost/bee/bee instead of failing loudly at boot.
"""

from __future__ import annotations

import logging

from app.core.config import Settings


def _base_kwargs(**overrides: object) -> dict[str, object]:
    """A production config that passes every hardening check, so each test
    only needs to override the one field it's exercising."""
    kwargs: dict[str, object] = {
        "ENVIRONMENT": "production",
        "WEBHOOK_SIGNATURE_REQUIRED": True,
        "WEBHOOK_SIGNING_SECRET": "a-real-signing-secret",
        "JWT_SECRET_KEY": "a-real-jwt-secret",
        "DATABASE_URL": "postgresql://user:pass@prod-host:5432/bee_prod",
        "BACKEND_CORS_ORIGINS": "https://app.example.com",
        "VECTOR_STORE_BACKEND": "pgvector",
    }
    kwargs.update(overrides)
    return kwargs


def test_fully_hardened_production_config_logs_nothing(caplog) -> None:
    with caplog.at_level(logging.CRITICAL):
        Settings(**_base_kwargs())
    assert "INSECURE PRODUCTION CONFIG" not in caplog.text


def test_local_environment_skips_the_check_entirely(caplog) -> None:
    """The validator is a no-op outside production, even with every default
    left in place — local/staging dev shouldn't ever see this warning."""
    with caplog.at_level(logging.CRITICAL):
        Settings(ENVIRONMENT="local")
    assert "INSECURE PRODUCTION CONFIG" not in caplog.text


def test_flags_signature_not_required(caplog) -> None:
    with caplog.at_level(logging.CRITICAL):
        Settings(**_base_kwargs(WEBHOOK_SIGNATURE_REQUIRED=False))
    assert "WEBHOOK_SIGNATURE_REQUIRED must be true" in caplog.text


def test_flags_placeholder_webhook_secret(caplog) -> None:
    with caplog.at_level(logging.CRITICAL):
        Settings(**_base_kwargs(WEBHOOK_SIGNING_SECRET="change-me-in-production"))
    assert "WEBHOOK_SIGNING_SECRET is still the default placeholder" in caplog.text


def test_flags_placeholder_jwt_secret(caplog) -> None:
    with caplog.at_level(logging.CRITICAL):
        Settings(**_base_kwargs(JWT_SECRET_KEY="change-me-in-production"))
    assert "JWT_SECRET_KEY is still the default placeholder" in caplog.text


def test_flags_unconfigured_database_in_production(caplog) -> None:
    """DATABASE_URL unset + POSTGRES_* left at their local-dev defaults means
    nobody actually pointed this deployment at a real database —
    sqlalchemy_database_uri would silently assemble postgresql://bee:bee@
    localhost:5432/bee instead of erroring, so this must be caught here."""
    kwargs = _base_kwargs()
    del kwargs["DATABASE_URL"]
    with caplog.at_level(logging.CRITICAL):
        Settings(**kwargs)
    assert "DATABASE_URL is unset" in caplog.text


def test_does_not_flag_database_when_postgres_vars_are_customized(caplog) -> None:
    """No DATABASE_URL is fine as long as the discrete POSTGRES_* vars were
    actually changed from their localhost/bee/bee local-dev defaults — that's
    still a deliberately configured real database, just assembled from parts
    instead of a single DSN."""
    kwargs = _base_kwargs()
    del kwargs["DATABASE_URL"]
    kwargs["POSTGRES_HOST"] = "prod-db.internal"
    kwargs["POSTGRES_PASSWORD"] = "a-real-password"  # noqa: S105 - test fixture, not a real secret
    with caplog.at_level(logging.CRITICAL):
        Settings(**kwargs)
    assert "INSECURE PRODUCTION CONFIG" not in caplog.text


def test_flags_localhost_cors_origin(caplog) -> None:
    with caplog.at_level(logging.CRITICAL):
        Settings(**_base_kwargs(BACKEND_CORS_ORIGINS="http://localhost:3000"))
    assert "BACKEND_CORS_ORIGINS is still the localhost-only dev default" in caplog.text


def test_flags_mock_vector_store_backend(caplog) -> None:
    with caplog.at_level(logging.CRITICAL):
        Settings(**_base_kwargs(VECTOR_STORE_BACKEND="mock"))
    assert 'VECTOR_STORE_BACKEND is set to "mock"' in caplog.text


def test_sqlalchemy_database_uri_falls_back_silently_without_the_check() -> None:
    """Demonstrates exactly why the check above earns its place: with no
    DATABASE_URL and default POSTGRES_*, the URI property itself never
    raises — it just assembles a connection string pointing at
    localhost/bee/bee, which is only caught at request time in production
    unless the hardening validator flags it at boot."""
    settings = Settings(ENVIRONMENT="local")
    assert settings.sqlalchemy_database_uri == "postgresql+psycopg://bee:bee@localhost:5432/bee"
