"""Tests for OpenTelemetry tracing setup (app.core.tracing) — opt-in via
OTEL_EXPORTER_OTLP_ENDPOINT, off by default (see app.main's create_app for
the "skip under pytest anyway" wiring, unaffected by any of this since
these tests call setup_tracing() directly)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI

from app.core import tracing
from app.core.tracing import reset_tracing_state, setup_tracing


@pytest.fixture(autouse=True)
def _reset_state():
    reset_tracing_state()
    yield
    reset_tracing_state()


class TestSetupTracingDisabled:
    def test_noop_when_endpoint_unset(self):
        """The default, real-app-startup state — must not raise, must not
        touch FastAPIInstrumentor at all."""
        app = FastAPI()
        with patch("app.core.tracing.settings") as mock_settings:
            mock_settings.OTEL_EXPORTER_OTLP_ENDPOINT = None
            with patch("opentelemetry.instrumentation.fastapi.FastAPIInstrumentor.instrument_app") as mock_instrument:
                setup_tracing(app)
                mock_instrument.assert_not_called()
        assert tracing._configured is False


class TestSetupTracingEnabled:
    def test_configures_and_instruments_once(self):
        app = FastAPI()
        with patch("app.core.tracing.settings") as mock_settings:
            mock_settings.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"
            mock_settings.OTEL_TRACES_SAMPLE_RATE = 1.0
            mock_settings.PROJECT_NAME = "BEE"
            mock_settings.ENVIRONMENT = "test"
            setup_tracing(app)
        assert tracing._configured is True

    def test_second_call_is_a_noop_idempotency_guard(self):
        """Same guard shape as register_listeners() — calling twice must
        not re-instrument (would double-wrap every FastAPI/SQLAlchemy/httpx
        call)."""
        app = FastAPI()
        with patch("app.core.tracing.settings") as mock_settings:
            mock_settings.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"
            mock_settings.OTEL_TRACES_SAMPLE_RATE = 1.0
            mock_settings.PROJECT_NAME = "BEE"
            mock_settings.ENVIRONMENT = "test"
            setup_tracing(app)
            with patch("opentelemetry.instrumentation.fastapi.FastAPIInstrumentor.instrument_app") as mock_instrument:
                setup_tracing(app)
                mock_instrument.assert_not_called()

    def test_reset_allows_reconfiguring(self):
        app = FastAPI()
        with patch("app.core.tracing.settings") as mock_settings:
            mock_settings.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"
            mock_settings.OTEL_TRACES_SAMPLE_RATE = 1.0
            mock_settings.PROJECT_NAME = "BEE"
            mock_settings.ENVIRONMENT = "test"
            setup_tracing(app)
            assert tracing._configured is True
            reset_tracing_state()
            assert tracing._configured is False
