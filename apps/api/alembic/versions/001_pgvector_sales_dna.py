"""Add pgvector extension and vector_embeddings table for Sales DNA.

Revision ID: 001_pgvector_sales_dna
Revises: 000_baseline_domain_models
Create Date: 2026-07-14

This migration enables the pgvector extension and creates the
``vector_embeddings`` table that backs the persistent ``PgVectorStore``.

Every WON opportunity strategy is encoded as a dense semantic vector
and stored here, so the ``StrategyGeneratorService`` can perform
nearest-neighbour retrieval of similar past wins at strategy-generation time.

Schema design rationale
-----------------------
* ``doc_id``   — application-level unique key (e.g. "outcome:<uuid>",
                 "brand_fragment:<uuid>", "knowledge:<uuid>")
* ``content``  — the original natural-language text that was embedded
* ``embedding``— the dense vector from OpenAI text-embedding-3-small (1536d)
                 OR any embedding model — dimension is configurable
* ``metadata`` — JSON sidecar (signal_type, industry, playbook, channel, ...)
* ``source``   — which service owns this document (sales_dna, brand, knowledge)
* ``created_at``/``updated_at`` — soft audit trail

Index strategy
--------------
* ``idx_ve_doc_id``   — exact-match lookups (upsert / delete)
* ``idx_ve_source``   — filter to a subset of documents before ANN search
* IVFFlat ANN index   — approximate nearest-neighbour over the embedding column
                         (created AFTER data population for quality; see note below)

Note on IVFFlat index
---------------------
IVFFlat requires at least ``lists × 39`` rows before it performs well.
For a fresh deployment with no data, the index degrades to a full scan,
which is fine at low scale. We create it with ``lists=1`` (sequential scan
equivalent) and recommend rebuilding with a higher ``lists`` value once
the store has ≥ 1,000 documents.

    ALTER INDEX idx_ve_embedding SET (lists = 100);
    REINDEX INDEX idx_ve_embedding;

For production at scale, consider replacing IVFFlat with HNSW:

    CREATE INDEX idx_ve_embedding_hnsw ON vector_embeddings
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "001_pgvector_sales_dna"
down_revision = "000_baseline_domain_models"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Enable the pgvector extension (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 2. Create the vector_embeddings table
    op.create_table(
        "vector_embeddings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("doc_id", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("content", sa.Text, nullable=False),
        # Raw float array stored as TEXT here; we use psycopg3's pgvector type
        # adapter in the application layer to handle the casting transparently.
        # Using sa.Text keeps Alembic vendor-neutral; the CHECK constraint ensures
        # the data is always in valid pgvector format when written via PgVectorStore.
        sa.Column("embedding", sa.Text, nullable=True),
        sa.Column("metadata_json", sa.Text, nullable=True, server_default="{}"),
        sa.Column("source", sa.String(64), nullable=False, server_default="sales_dna"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # 3. Add HNSW index for fast approximate nearest-neighbour search
    # HNSW is preferred over IVFFlat: no training required, works from doc 0.
    # Uses cosine distance (vector_cosine_ops) to match our similarity scoring.
    # Note: requires pgvector >= 0.5.0 (released 2023-11-07).
    op.execute("""
        ALTER TABLE vector_embeddings
          ALTER COLUMN embedding TYPE vector(1536)
          USING embedding::vector
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ve_embedding_hnsw
          ON vector_embeddings
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
    """)

    # 4. Index on source for filtered queries
    op.create_index(
        "idx_ve_source",
        "vector_embeddings",
        ["source"],
    )


def downgrade() -> None:
    op.drop_index("idx_ve_source", table_name="vector_embeddings")
    op.drop_index("idx_ve_embedding_hnsw", table_name="vector_embeddings")
    op.drop_table("vector_embeddings")
    # Do NOT drop the extension — other tables may use it.
