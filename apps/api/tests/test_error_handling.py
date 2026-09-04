"""Unhandled exceptions must come back as JSON 500 *with* CORS headers.

Starlette's outermost ServerErrorMiddleware writes a bare 500 without CORS
headers, which the browser surfaces to apps/web as a network failure. The
app-level exception handler in app.main routes them through FastAPI's own
exception middleware (inside CORS) instead — see the 2026-09-04 incident.
"""

from fastapi.testclient import TestClient

from app.main import create_app


def test_unhandled_exception_is_json_500_with_cors_headers() -> None:
    app = create_app()

    @app.get("/__boom")
    def boom() -> None:
        raise RuntimeError("kaboom")

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.get("/__boom", headers={"Origin": "http://localhost:3000"})

    assert res.status_code == 500
    assert res.json() == {"detail": "internal_error"}
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_schema_check_reports_in_sync_when_no_alembic_table(engine) -> None:  # type: ignore[no-untyped-def]
    from app.core.schema_check import check_schema

    # The test engine is create_all()-provisioned SQLite: no alembic_version
    # table. That must read as "nothing to compare", never as drift.
    status = check_schema(engine)
    assert status.db_version is None
    assert status.error is None
    assert status.in_sync is True
