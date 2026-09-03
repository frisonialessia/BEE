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
    # SQLAlchemyInstrumentor/HTTPXClientInstrumentor (unlike
    # FastAPIInstrumentor, which is per-app-instance) patch process-wide —
    # a test in TestSetupTracingEnabled below that actually calls
    # setup_tracing() would otherwise leave EVERY DB query and httpx call
    # in the rest of the suite wrapped in a span for a TracerProvider
    # whose BatchSpanProcessor keeps retrying an export to an unreachable
    # localhost:4317 for the remainder of the process. Undo all of it,
    # every test, regardless of whether this particular one instrumented
    # anything — uninstrumenting something never instrumented is a no-op.
    from opentelemetry import trace
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

    # The default global provider (nothing configured yet, or this
    # particular test never called setup_tracing()) is a bare
    # ProxyTracerProvider with no shutdown() at all — only a real
    # TracerProvider (set once setup_tracing() actually runs) has one.
    current_provider = trace.get_tracer_provider()
    shutdown = getattr(current_provider, "shutdown", None)
    if shutdown is not None:
        shutdown()
    if SQLAlchemyInstrumentor().is_instrumented_by_opentelemetry:
        SQLAlchemyInstrumentor().uninstrument()
    if HTTPXClientInstrumentor().is_instrumented_by_opentelemetry:
        HTTPXClientInstrumentor().uninstrument()


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
