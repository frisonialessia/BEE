"""VectorKnowledgeBase — pluggable vector similarity search for BEE.

Backend selection
-----------------
The active backend is chosen at startup from ``VECTOR_STORE_BACKEND``:

* ``mock``     — in-memory TF-IDF cosine similarity (default).
                  Zero deps, instant start, but resets on restart.
                  Perfect for development and CI.

* ``pgvector`` — persistent semantic search in PostgreSQL using the
                  pgvector extension + OpenAI text-embedding-3-small.
                  Recommended for staging and production.
                  Requires: pgvector extension, AI_API_KEY (optional but
                  recommended — falls back to keyword embeddings without it).

Swap rule
---------
All services depend only on ``IVectorStore``. Changing the backend requires
only the ``VECTOR_STORE_BACKEND`` env var — zero application code changes.
"""

from __future__ import annotations

from app.services.vector_store.interface import IVectorStore, ScoredDocument, VectorDocument
from app.services.vector_store.mock_store import MockVectorStore

# Module-level singleton so the same store instance is shared across requests.
_STORE: IVectorStore | None = None

# What _build_store() actually returned, independent of what
# settings.VECTOR_STORE_BACKEND asked for — the two can disagree (pgvector
# requested, construction failed, Mock returned instead) and that gap is
# exactly what get_vector_store_status()/GET /api/v1/ready exists to catch.
# See _build_store's docstring.
_ACTIVE_BACKEND: str | None = None
_FALLBACK_REASON: str | None = None


def get_vector_store() -> IVectorStore:
    """Return the application-wide vector store singleton.

    First call: reads ``VECTOR_STORE_BACKEND`` from settings and initialises
    the appropriate backend. Subsequent calls return the cached instance.

    The singleton is reset between tests via :func:`reset_vector_store`.
    """
    global _STORE  # noqa: PLW0603
    if _STORE is None:
        _STORE = _build_store()
    return _STORE


def get_vector_store_status() -> dict[str, str | None]:
    """The backend actually in use, for GET /api/v1/ready — never
    ``None`` for ``requested``/``active`` once :func:`get_vector_store` has
    run at least once (health/ready calls it below to guarantee that).
    ``fallback_reason`` is set only when ``active`` disagrees with
    ``requested`` (pgvector asked for, Mock actually running) — that
    mismatch, not merely "backend=mock", is the thing worth alerting on,
    since an operator who deliberately configured mock already gets that
    surfaced at boot (see Settings' production-readiness check).
    """
    from app.core.config import get_settings

    get_vector_store()  # ensure _ACTIVE_BACKEND is populated
    return {
        "requested": get_settings().VECTOR_STORE_BACKEND,
        "active": _ACTIVE_BACKEND,
        "fallback_reason": _FALLBACK_REASON,
    }


def _build_store() -> IVectorStore:
    """Instantiate the correct backend based on configuration."""
    global _ACTIVE_BACKEND, _FALLBACK_REASON  # noqa: PLW0603
    from app.core.config import get_settings
    from app.core.logging import get_logger

    settings = get_settings()
    logger = get_logger(__name__)
    backend = settings.VECTOR_STORE_BACKEND

    if backend == "pgvector":
        try:
            from app.services.vector_store.pg_store import PgVectorStore

            store = PgVectorStore()
            logger.info("VectorKnowledgeBase: using PgVectorStore (persistent, semantic)")
            _ACTIVE_BACKEND = "pgvector"
            _FALLBACK_REASON = None
            return store
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "PgVectorStore initialisation failed — falling back to MockVectorStore. "
                "Check DATABASE_URL and pgvector extension. Error: %s",
                exc,
            )
            _ACTIVE_BACKEND = "mock"
            _FALLBACK_REASON = str(exc)
            return MockVectorStore()

    # Explicitly configured mock (development / CI) — not a fallback, so
    # no _FALLBACK_REASON; Settings' own production-readiness check is what
    # flags this deliberately-mock case.
    logger.info(
        "VectorKnowledgeBase: using MockVectorStore (in-memory, resets on restart). "
        "Set VECTOR_STORE_BACKEND=pgvector for production."
    )
    _ACTIVE_BACKEND = "mock"
    _FALLBACK_REASON = None
    return MockVectorStore()


def reset_vector_store() -> None:
    """Reset the singleton (used in tests to isolate state between test cases)."""
    global _STORE, _ACTIVE_BACKEND, _FALLBACK_REASON  # noqa: PLW0603
    _STORE = None
    _ACTIVE_BACKEND = None
    _FALLBACK_REASON = None


__all__ = [
    "IVectorStore",
    "MockVectorStore",
    "ScoredDocument",
    "VectorDocument",
    "get_vector_store",
    "get_vector_store_status",
    "reset_vector_store",
]
