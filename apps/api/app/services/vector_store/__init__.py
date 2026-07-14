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


def _build_store() -> IVectorStore:
    """Instantiate the correct backend based on configuration."""
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
            return store
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "PgVectorStore initialisation failed — falling back to MockVectorStore. "
                "Check DATABASE_URL and pgvector extension. Error: %s",
                exc,
            )
            return MockVectorStore()

    # Default: mock (development / CI)
    logger.info(
        "VectorKnowledgeBase: using MockVectorStore (in-memory, resets on restart). "
        "Set VECTOR_STORE_BACKEND=pgvector for production."
    )
    return MockVectorStore()


def reset_vector_store() -> None:
    """Reset the singleton (used in tests to isolate state between test cases)."""
    global _STORE  # noqa: PLW0603
    _STORE = None


__all__ = [
    "IVectorStore",
    "MockVectorStore",
    "ScoredDocument",
    "VectorDocument",
    "get_vector_store",
    "reset_vector_store",
]
