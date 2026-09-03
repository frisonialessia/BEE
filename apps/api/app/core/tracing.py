"""Distributed tracing (OpenTelemetry) — opt-in, inert unless
``OTEL_EXPORTER_OTLP_ENDPOINT`` is set, same convention as Sentry
(``settings.SENTRY_DSN``, see app.main's ``create_app()``) right next to it.

Why this exists
----------------
Sentry (already wired) tells you a request failed. It doesn't tell you
*where the time went* across a request that touches the DB, an external
API call (Salesforce/HubSpot/Jira, Google Search, LinkedIn), and a
handful of internal service calls in between — which is most requests in
this codebase (see StrategyGeneratorService.enrich's own 7-step
docstring, or any *_import.py's paginated fetch loop). Without tracing,
"the /opportunities/{id}/outcome endpoint is slow" has no answer better
than adding print statements. ``opentelemetry-*`` was already a
dependency (requirements.txt) — this file is what actually initializes
it; before this, the dependency weight was being paid for nothing.

What gets instrumented
-----------------------
FastAPI (every request becomes a root span), SQLAlchemy (every query a
child span — this is where N+1s and slow queries actually get found),
httpx (every outbound call to a provider — Salesforce, HubSpot, Jira,
Google Search, Sentry itself is exempted since sentry-sdk uses its own
transport, not httpx). Deliberately NOT custom application spans beyond
this — the three instrumentations above already cover every I/O
boundary that matters; hand-adding ``with tracer.start_span(...)``
throughout the codebase can come later, driven by an actual slow trace,
not speculatively.

Where spans go
---------------
Wherever ``OTEL_EXPORTER_OTLP_ENDPOINT`` points — an OpenTelemetry
Collector, or a managed backend that speaks OTLP/gRPC directly (Honeycomb,
Grafana Cloud, Datadog's OTLP intake, ...). Auth for a managed backend
that needs one is the OTEL SDK's own standard mechanism — set
``OTEL_EXPORTER_OTLP_HEADERS`` (e.g. ``x-honeycomb-team=<key>``) as a
plain environment variable; the exporter reads it itself, no BEE-specific
config needed for that part.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import settings
from app.core.logging import get_logger

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = get_logger(__name__)

_configured = False


def setup_tracing(app: FastAPI) -> None:
    """Initialize the OTEL SDK and instrument FastAPI/SQLAlchemy/httpx.

    No-op when ``OTEL_EXPORTER_OTLP_ENDPOINT`` is unset (the default) —
    zero behavior change, no collector needed to run this app, mirroring
    ``SENTRY_DSN``'s own "None disables it outright" contract. Guarded by
    a module-level flag rather than being called only once implicitly,
    for the same reason ``app.services.events.register_listeners()`` is:
    re-instrumenting FastAPI/SQLAlchemy/httpx a second time in the same
    process would double-wrap every call.
    """
    global _configured
    if not settings.OTEL_EXPORTER_OTLP_ENDPOINT or _configured:
        return

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

    resource = Resource.create(
        {
            SERVICE_NAME: settings.PROJECT_NAME,
            "deployment.environment": settings.ENVIRONMENT,
        }
    )
    # Same "off by default, a deployment opts in explicitly" reasoning as
    # SENTRY_TRACES_SAMPLE_RATE — full sampling (1.0) by default here
    # because, unlike Sentry, nothing is billed per-span until a collector
    # forwards it somewhere that charges; a deployment pointed at a
    # metered backend sets OTEL_TRACES_SAMPLE_RATE down explicitly.
    sampler = ParentBased(TraceIdRatioBased(settings.OTEL_TRACES_SAMPLE_RATE))
    provider = TracerProvider(resource=resource, sampler=sampler)
    exporter = OTLPSpanExporter(endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    SQLAlchemyInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()

    _configured = True
    logger.info("OpenTelemetry tracing enabled (endpoint=%s)", settings.OTEL_EXPORTER_OTLP_ENDPOINT)


def reset_tracing_state() -> None:
    """Test-only: clear the idempotency guard — mirrors
    reset_redis_client_cache()/reset_aws_secrets_cache()'s own reset hooks
    so a test that wants to exercise setup_tracing() twice can."""
    global _configured
    _configured = False
