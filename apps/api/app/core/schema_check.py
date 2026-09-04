"""Schema drift guard — is the database at the revision this code expects?

Vercel redeploys the API on every push but never runs Alembic, so the code
and the schema can silently diverge (2026-09-04: code at 047, Supabase at
028, every login a 500). This module compares the two at startup and
exposes the result to the health endpoints so the drift is visible in one
call instead of being inferred from a stack trace.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class SchemaStatus:
    db_version: str | None
    code_head: str | None
    in_sync: bool
    error: str | None = None
    # ``host:port/dbname`` of the database that was checked — never the
    # credentials. When the deployment platform's ``DATABASE_URL`` points at
    # a different server than the one an operator just migrated (2026-09-04:
    # Supabase at 047, production still reporting 025), this is the one field
    # that tells them *which* database to migrate.
    db_target: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


_LAST: SchemaStatus | None = None


def code_head_revision() -> str | None:
    """The newest Alembic revision shipped with this code, or None if the
    migrations directory is not available (e.g. a trimmed deploy bundle)."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        ini = Path(__file__).resolve().parents[2] / "alembic.ini"
        if not ini.exists():
            return None
        cfg = Config(str(ini))
        cfg.set_main_option("script_location", str(ini.parent / "alembic"))
        heads = ScriptDirectory.from_config(cfg).get_heads()
        return heads[0] if len(heads) == 1 else ",".join(sorted(heads))
    except Exception as exc:  # noqa: BLE001 — never let a check crash startup
        logger.warning("Could not resolve Alembic head from code: %s", exc)
        return None


def db_target(engine: Engine) -> str | None:
    """``host:port/dbname`` of the engine, without username or password."""
    try:
        url = engine.url
        host = url.host or "local"
        port = f":{url.port}" if url.port else ""
        return f"{host}{port}/{url.database or ''}"
    except Exception:  # noqa: BLE001
        return None


def db_revision(engine: Engine) -> str | None:
    if not inspect(engine).has_table("alembic_version"):
        return None
    with engine.connect() as conn:
        row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
        return row[0] if row else None


def check_schema(engine: Engine) -> SchemaStatus:
    """Compare DB revision with code head; cache and log the result."""
    global _LAST
    head = code_head_revision()
    target = db_target(engine)
    try:
        db = db_revision(engine)
    except Exception as exc:  # noqa: BLE001
        _LAST = SchemaStatus(
            db_version=None, code_head=head, in_sync=False, error=str(exc)[:200], db_target=target
        )
        logger.warning("Schema check skipped — database %s unavailable: %s", target, exc)
        return _LAST
    # No alembic_version table = a create_all()-provisioned dev/test DB:
    # nothing to compare, not drift.
    in_sync = head is None or db is None or db == head
    _LAST = SchemaStatus(db_version=db, code_head=head, in_sync=in_sync, db_target=target)
    if not in_sync:
        logger.critical(
            "SCHEMA DRIFT — database %s is at Alembic revision %s but this code expects %s. "
            "Requests touching newer columns will fail with 500 until `alembic upgrade head` "
            "runs against THAT database (see DEPLOY_CHECKLIST.md §1 Database).",
            target,
            db,
            head,
        )
    return _LAST


def last_schema_status() -> SchemaStatus | None:
    return _LAST
