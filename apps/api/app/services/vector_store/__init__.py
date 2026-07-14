"""VectorKnowledgeBase — pluggable vector similarity search for BEE.

Swap the implementation by changing ``get_vector_store()`` below.
All services depend only on ``IVectorStore`` — zero code changes needed.
"""

from app.services.vector_store.interface import IVectorStore, ScoredDocument, VectorDocument
from app.services.vector_store.mock_store import MockVectorStore

# Module-level singleton so the same vocabulary is shared across requests.
# In production, replace with PgVectorStore(connection_pool) or PineconeStore(api_key).
_STORE: IVectorStore | None = None


def get_vector_store() -> IVectorStore:
    """Return the application-wide vector store singleton."""
    global _STORE  # noqa: PLW0603
    if _STORE is None:
        _STORE = MockVectorStore()
    return _STORE


def reset_vector_store() -> None:
    """Reset the singleton (used in tests to isolate state)."""
    global _STORE  # noqa: PLW0603
    _STORE = None


__all__ = ["IVectorStore", "ScoredDocument", "VectorDocument", "MockVectorStore", "get_vector_store", "reset_vector_store"]
