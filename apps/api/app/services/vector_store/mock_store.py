"""MockVectorStore — production-quality in-memory vector store.

Uses keyword-frequency TF-style embedding with cosine similarity to provide
real semantic search behaviour without any external dependencies. Works
identically in development, CI, and production (as long as the doc count
stays in the low thousands — suitable for brand fragments and knowledge bases).

Algorithm
---------
1. **Embedding**: tokenise text → lower-case word-frequency vector over a
   shared vocabulary. Vocabulary is grown incrementally as documents are
   upserted. This gives a sparse TF embedding that captures content overlap.

2. **Cosine similarity**: (A·B) / (|A| × |B|). Perfectly matched texts → 1.0;
   completely disjoint → 0.0.

3. **Metadata filtering**: applied as an exact-match pre-filter before ranking.

Limitations (and why they're acceptable)
-----------------------------------------
* Sparse vectors miss synonyms (e.g. "email" ≠ "mail"). For brand fragments
  this is fine because they share domain-specific vocabulary naturally.
* No persistence across restarts. Suitable for session-scoped stores or
  stores that are re-populated at startup from the DB.
* Replace with ``PgVectorStore`` or ``PineconeStore`` for dense embeddings
  and persistence without changing any service code.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from typing import Any

from app.services.vector_store.interface import IVectorStore, ScoredDocument, VectorDocument


def _tokenize(text: str) -> list[str]:
    """Lower-case, strip punctuation, split on whitespace."""
    return re.findall(r"[a-záéíóúüñ\w]+", text.lower())


def _build_freq_vector(tokens: list[str], vocab: dict[str, int]) -> list[float]:
    """Build a TF frequency vector aligned to the current vocabulary."""
    counts: dict[int, float] = defaultdict(float)
    for t in tokens:
        if t in vocab:
            counts[vocab[t]] += 1.0
    dim = len(vocab)
    vec = [counts.get(i, 0.0) for i in range(dim)]
    return vec


def _cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


class MockVectorStore(IVectorStore):
    """In-memory vector store using keyword-frequency cosine similarity.

    Thread-safe for single-threaded use (FastAPI async is fine).
    Not suitable for multi-process deployments — use PgVectorStore instead.
    """

    def __init__(self) -> None:
        # Maps token → index in the vocabulary dimension
        self._vocab: dict[str, int] = {}
        # Maps doc_id → VectorDocument
        self._docs: dict[str, VectorDocument] = {}

    # ── Public IVectorStore API ───────────────────────────────────────────────

    def embed(self, text: str) -> list[float]:
        """Embed text into the current vocabulary space."""
        tokens = _tokenize(text)
        self._grow_vocab(tokens)
        vec = _build_freq_vector(tokens, self._vocab)
        return vec

    def upsert(self, doc_id: str, content: str, metadata: dict[str, Any] | None = None) -> None:
        """Embed and store a document, replacing any existing entry with the same id."""
        tokens = _tokenize(content)
        self._grow_vocab(tokens)
        vec = _build_freq_vector(tokens, self._vocab)

        self._docs[doc_id] = VectorDocument(
            id=doc_id,
            content=content,
            vector=vec,
            metadata=metadata or {},
        )
        # Re-embed all existing docs to align with the updated vocabulary
        self._realign_vectors()

    def query(
        self,
        text: str,
        top_k: int = 5,
        filter_metadata: dict[str, Any] | None = None,
    ) -> list[ScoredDocument]:
        """Find top_k most similar documents by cosine similarity."""
        if not self._docs:
            return []

        q_tokens = _tokenize(text)
        self._grow_vocab(q_tokens)
        q_vec = _build_freq_vector(q_tokens, self._vocab)

        results: list[ScoredDocument] = []
        for doc in self._docs.values():
            # Apply metadata filter
            if filter_metadata and not all(doc.metadata.get(k) == v for k, v in filter_metadata.items()):
                continue

            # Realign doc vector to current vocabulary before scoring
            doc_tokens = _tokenize(doc.content)
            doc_vec = _build_freq_vector(doc_tokens, self._vocab)
            score = _cosine(q_vec, doc_vec)
            results.append(
                ScoredDocument(
                    id=doc.id,
                    content=doc.content,
                    score=round(score, 4),
                    metadata=doc.metadata,
                )
            )

        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def delete(self, doc_id: str) -> None:
        """Remove a document from the store."""
        self._docs.pop(doc_id, None)

    def count(self) -> int:
        return len(self._docs)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _grow_vocab(self, tokens: list[str]) -> None:
        """Add any new tokens to the shared vocabulary."""
        for token in tokens:
            if token not in self._vocab:
                self._vocab[token] = len(self._vocab)

    def _realign_vectors(self) -> None:
        """Re-embed all docs after vocabulary growth.

        This is O(n × vocab_size) but only called on upsert, not on query.
        Keeps query paths fast.
        """
        for doc in self._docs.values():
            tokens = _tokenize(doc.content)
            doc.vector = _build_freq_vector(tokens, self._vocab)
