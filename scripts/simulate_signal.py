#!/usr/bin/env python3
"""BEE Dry Run — simulate a LinkedIn webhook through the full ingestion pipeline.

Injects a fake LinkedIn webhook with a valid HMAC signature, tracks logs through
IngestionWorker → ExternalAPIOrchestrator → EnrichmentContext, and validates that
failure logs are diagnostic without exposing SecretManager credentials.

Usage (from repo root)
----------------------
    # In-process dry run (SQLite, no running server required):
    python scripts/simulate_signal.py

    # Against a running API (docker compose / uvicorn):
    python scripts/simulate_signal.py --mode http --base-url http://localhost:8000

    # Simulate LinkedIn API failure (validates safe error logs):
    python scripts/simulate_signal.py --failure

Exit codes: 0 = success, 1 = validation failed
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
import uuid
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from unittest.mock import patch

# Ensure apps/api is on PYTHONPATH when run from repo root
_REPO_ROOT = Path(__file__).resolve().parents[1]
_API_ROOT = _REPO_ROOT / "apps" / "api"
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

# ── Secret patterns that must NEVER appear in logs ───────────────────────────
_FORBIDDEN_LOG_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{10,}"),           # OpenAI-style keys
    re.compile(r"sk-ant-[a-zA-Z0-9]{10,}"),       # Anthropic keys
    re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}"),  # Raw bearer tokens in logs
    re.compile(r"LINKEDIN_ACCESS_TOKEN=[^\s]+"),   # Env leak
    re.compile(r"Authorization:\s*Bearer\s+\S+"), # Header leak
]


def _build_linkedin_payload() -> dict[str, Any]:
    """Realistic fake LinkedIn Sales Nav research event."""
    return {
        "provider": "linkedin",
        "event_type": "linkedin_research",
        "title": "TechFinance VP Sales researching sales intelligence platforms",
        "event": "funding.round.announced",
        "description": "Lead viewed pricing page and downloaded ROI calculator",
        "external_id": f"dry-run-linkedin-{uuid.uuid4().hex[:12]}",
        "company": {
            "name": "TechFinance",
            "domain": "techfinance.io",
            "industry": "fintech",
            "country": "US",
        },
        "lead": {
            "full_name": "Alice Martin",
            "email": "alice.martin@techfinance.io",
            "linkedin_url": "https://linkedin.com/in/alice-martin-techfinance",
        },
        "data": {
            "intent_keywords": ["sales intelligence", "crm comparison", "GTM stack"],
            "content_url": "https://techfinance.io/pricing",
        },
    }


def _compute_signature(body: bytes, secret: str) -> str:
    from app.core.security import compute_signature

    return compute_signature(body, secret=secret)


class _LogCapture(logging.Handler):
    """Capture log records for post-run validation."""

    def __init__(self) -> None:
        super().__init__()
        self.records: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(self.format(record))


def _validate_logs_safe(log_lines: list[str], secret: str) -> list[str]:
    """Return list of violations if secrets appear in logs."""
    violations: list[str] = []
    combined = "\n".join(log_lines)

    if secret and secret in combined:
        violations.append("WEBHOOK secret found verbatim in logs")

    for pattern in _FORBIDDEN_LOG_PATTERNS:
        if pattern.search(combined):
            violations.append(f"Forbidden pattern matched: {pattern.pattern}")

    return violations


def _print_trace(log_lines: list[str], markers: list[str]) -> None:
    """Print log lines matching pipeline markers."""
    print("\n── Pipeline trace ──")
    for line in log_lines:
        if any(m in line for m in markers):
            print(f"  {line}")


@contextmanager
def _capture_logs() -> Generator[_LogCapture, None, None]:
    """Attach capture handler to BEE loggers (including background worker threads)."""
    handler = _LogCapture()
    handler.setFormatter(logging.Formatter("%(levelname)-8s | %(name)s | %(message)s"))
    handler.setLevel(logging.DEBUG)
    loggers = (
        "app",
        "app.services.external_api",
        "app.api",
        "app.services.signal_engine",
        "app.services.strategy_generator",
    )
    for name in loggers:
        log = logging.getLogger(name)
        log.setLevel(logging.INFO)
        log.addHandler(handler)
    try:
        yield handler
    finally:
        for name in loggers:
            logging.getLogger(name).removeHandler(handler)


def _setup_sqlite_app():
    """Create FastAPI app wired to in-memory SQLite (hermetic dry run)."""
    from collections.abc import Generator as Gen
    from contextlib import contextmanager

    from fastapi.testclient import TestClient
    from sqlalchemy.pool import StaticPool
    from sqlmodel import Session, SQLModel, create_engine

    import app.models  # noqa: F401
    from app.core.database import get_session
    from app.main import create_app
    from app.services.external_api.worker import reset_ingestion_worker

    reset_ingestion_worker()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    @contextmanager
    def _sqlite_session_scope():
        """Replace worker session_scope so background tasks use SQLite too."""
        with Session(engine) as session:
            try:
                yield session
                session.commit()
            except Exception:
                session.rollback()
                raise

    def _override() -> Gen[Session, None, None]:
        with Session(engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return app, engine, TestClient(app), _sqlite_session_scope


def run_inline(*, simulate_failure: bool = False) -> int:
    """Run full pipeline in-process with SQLite."""
    import os

    # Dry-run env: enable ingestion + signatures, use test secret
    test_secret = "dry-run-webhook-secret-do-not-use-in-prod"
    os.environ.setdefault("EXTERNAL_INGESTION_ENABLED", "true")
    os.environ.setdefault("WEBHOOK_SIGNATURE_REQUIRED", "true")
    os.environ.setdefault("WEBHOOK_SIGNING_SECRET", test_secret)
    os.environ.setdefault("LINKEDIN_WEBHOOK_SECRET", test_secret)
    os.environ.setdefault("API_SECRET_KEY", "")  # disable API key for script

    from app.core.config import get_settings

    get_settings.cache_clear()

    markers = [
        "External webhook accepted",
        "IngestionWorker: enqueued",
        "IngestionWorker: external enrichment",
        "IngestionWorker: EnrichmentContext applied",
        "IngestionWorker: processed webhook",
        "LinkedInProvider",
    ]
    if simulate_failure:
        markers.append("LinkedInProvider: network error")

    patches = []
    if simulate_failure:
        # Force "configured" path then fail network — validates failure logs
        os.environ["LINKEDIN_ACCESS_TOKEN"] = "fake-token-for-failure-test"
        get_settings.cache_clear()

        from app.services.external_api.providers.linkedin import LinkedInProvider
        import httpx

        def _raise_connection_error(*_args, **_kwargs):
            raise httpx.ConnectError("Connection refused — simulated LinkedIn outage")

        patches.append(patch.object(LinkedInProvider, "_api_get", side_effect=_raise_connection_error))

    with _capture_logs() as log_capture:
        import app.services.external_api.worker as worker_module

        for p in patches:
            p.start()
        original_scope = worker_module.session_scope
        try:
            app, engine, client, sqlite_scope = _setup_sqlite_app()
            worker_module.session_scope = sqlite_scope

            payload = _build_linkedin_payload()
            body = json.dumps(payload).encode()
            signature = _compute_signature(body, test_secret)

            with client:
                from app.services.external_api.worker import get_ingestion_worker

                worker = get_ingestion_worker()
                processed_before = worker.processed_count

                resp = client.post(
                    "/api/v1/webhooks/receive",
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-BEE-Signature": signature,
                    },
                )

                if resp.status_code != 202:
                    print(f"FAIL: webhook returned {resp.status_code}: {resp.text}")
                    return 1

                task_id = resp.json()["task_id"]
                print(f"OK: webhook accepted (202) task_id={task_id}")

                deadline = time.monotonic() + 10.0
                while time.monotonic() < deadline:
                    if worker.processed_count > processed_before and worker.queue_depth == 0:
                        break
                    time.sleep(0.05)

                print(
                    f"OK: worker processed={worker.processed_count} "
                    f"errors={worker.error_count} queue={worker.queue_depth}"
                )

                from sqlmodel import Session, select

                from app.models.signal import Signal

                with Session(engine) as session:
                    signals = session.exec(select(Signal)).all()
                    if not signals:
                        print("FAIL: no signal persisted after dry run")
                        return 1
                    signal = signals[-1]
                    session.refresh(signal)
                    ext = (signal.raw_payload or {}).get("external_enrichment") or {}
                    linkedin = ext.get("linkedin") or {}
                    print("\n── EnrichmentContext snapshot ──")
                    print(f"  signal_id:     {signal.id}")
                    print(f"  lead_title:    {ext.get('lead', {}).get('title') or linkedin.get('lead_title')}")
                    print(f"  providers:     {ext.get('providers_called')}")
                    print(f"  linkedin_ok:   {linkedin.get('success')}")
                    print(f"  linkedin_mock: {linkedin.get('mock')}")
                    if linkedin.get("error"):
                        print(f"  linkedin_error: {linkedin.get('error')}")
        finally:
            worker_module.session_scope = original_scope
            for p in patches:
                p.stop()

    log_lines = log_capture.records
    _print_trace(log_lines, markers)

    # Validate pipeline completed via structured logs
    log_text = "\n".join(log_lines)
    if "IngestionWorker: external enrichment" not in log_text:
        print("FAIL: missing external enrichment log entry")
        return 1
    if simulate_failure:
        if "LinkedInProvider: network error" not in log_text:
            print("FAIL: missing LinkedIn failure diagnostic log")
            return 1
        if "linkedin_success=False" not in log_text:
            print("FAIL: enrichment log should report linkedin_success=False")
            return 1
    elif "EnrichmentContext applied" not in log_text and "enrichment persisted on signal" not in log_text:
        print("FAIL: missing EnrichmentContext applied log entry")
        return 1

    violations = _validate_logs_safe(log_lines, test_secret)
    if simulate_failure:
        # Also ensure fake token never leaked
        violations.extend(_validate_logs_safe(log_lines, "fake-token-for-failure-test"))

    if violations:
        print("\nFAIL: log safety violations:")
        for v in violations:
            print(f"  - {v}")
        return 1

    print("\nOK: dry run passed — pipeline trace complete, logs are secret-safe")
    return 0


def run_http(base_url: str, *, simulate_failure: bool = False) -> int:  # noqa: ARG001
    """POST webhook to a running API instance."""
    import os

    try:
        import httpx
    except ImportError:
        print("FAIL: httpx required for --mode http")
        return 1

    test_secret = os.environ.get("LINKEDIN_WEBHOOK_SECRET") or os.environ.get(
        "WEBHOOK_SIGNING_SECRET", "change-me-in-production"
    )
    payload = _build_linkedin_payload()
    body = json.dumps(payload).encode()
    signature = _compute_signature(body, test_secret)

    url = f"{base_url.rstrip('/')}/api/v1/webhooks/receive"
    print(f"POST {url}")

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-BEE-Signature": signature,
            },
        )
        if resp.status_code != 202:
            print(f"FAIL: {resp.status_code} {resp.text}")
            return 1
        task_id = resp.json()["task_id"]
        print(f"OK: accepted task_id={task_id}")

        # Poll status
        status_url = f"{base_url.rstrip('/')}/api/v1/webhooks/status"
        for _ in range(50):
            status = client.get(status_url).json()
            if status.get("processed_count", 0) >= 1:
                print(f"OK: worker processed={status['processed_count']} errors={status['error_count']}")
                return 0
            time.sleep(0.2)

    print("FAIL: worker did not process task within timeout — check API logs")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="BEE LinkedIn webhook dry run")
    parser.add_argument(
        "--mode",
        choices=("inline", "http"),
        default="inline",
        help="inline = in-process SQLite (default); http = running API",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="API base URL for --mode http",
    )
    parser.add_argument(
        "--failure",
        action="store_true",
        help="Simulate LinkedIn API outage and validate safe error logs",
    )
    args = parser.parse_args()

    print("BEE Dry Run — LinkedIn webhook simulation")
    print(f"  mode: {'inline (SQLite)' if args.mode == 'inline' else 'http'}")
    if args.failure:
        print("  scenario: LinkedIn API failure (log safety check)")

    if args.mode == "inline":
        return run_inline(simulate_failure=args.failure)
    return run_http(args.base_url, simulate_failure=args.failure)


if __name__ == "__main__":
    sys.exit(main())
