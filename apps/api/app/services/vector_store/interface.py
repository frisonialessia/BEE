"""IVectorStore — abstract interface for vector similarity search.

BEE's AI services need semantic search to retrieve relevant brand fragments,
market signals, and knowledge entries. This interface decouples the search
logic from any specific vector DB implementation.

Current implementation hierarchy
---------------------------------
IVectorStore (abstract)
├── MockVectorStore     ← default, in-memory, cosine on keyword embeddings
│                          no external dependencies, runs in all environments
├── [Future] PgVectorStore  ← pgvector PostgreSQL extension
└── [Future] PineconeStore  ← managed cloud vector DB

Swap rule
---------
To change vector DB: implement ``IVectorStore`` and update
``get_vector_store()`` in ``__init__.py``. Zero changes to any service.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class VectorDocument:
    """A document stored in the vector store with its embedding metadata."""

    id: str
    content: str
    vector: list[float]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScoredDocument:
    """A document retrieved from the vector store with its similarity score."""

    id: str
    content: str
    score: float  # cosine similarity: 0 (dissimilar) to 1 (identical)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_relevant(self) -> bool:
        """Return True if the document is considered relevant (score > 0.1)."""
        return self.score > 0.1


class IVectorStore(ABC):
    """Abstract vector similarity search interface.

    All implementations MUST be stateless with respect to the caller —
    they may maintain internal state for the store itself (e.g., an index)
    but callers should treat each method call as independent.
    """

    @abstractmethod
    def embed(self, text: str) -> list[float]:
        """Convert text to a vector representation.

        Args:
            text: The input text to embed.

        Returns:
            A list of floats representing the embedding vector.
            The length (dimensionality) is implementation-specific.
        """
        raise NotImplementedError

    @abstractmethod
    def upsert(self, doc_id: str, content: str, metadata: dict[str, Any] | None = None) -> None:
        """Store or update a document in the vector store.

        Embeds the content and stores it with the given metadata.
        If a document with ``doc_id`` already exists, it is replaced.

        Args:
            doc_id:   Unique identifier for this document.
            content:  The text content to embed and store.
            metadata: Optional key-value pairs stored alongside the vector.
        """
        raise NotImplementedError

    @abstractmethod
    def query(self, text: str, top_k: int = 5, filter_metadata: dict[str, Any] | None = None) -> list[ScoredDocument]:
        """Find the most semantically similar documents.

        Args:
            text:            The query text.
            top_k:           Maximum number of results to return.
            filter_metadata: Optional exact-match filter applied before ranking.

        Returns:
            A list of :class:`ScoredDocument` objects, sorted by score descending.
        """
        raise NotImplementedError

    @abstractmethod
    def delete(self, doc_id: str) -> None:
        """Remove a document from the store."""
        raise NotImplementedError

    @abstractmethod
    def count(self) -> int:
        """Return the total number of documents in the store."""
        raise NotImplementedError
