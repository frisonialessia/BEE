"""PersonalBrandService data models.

The VoiceProfile is the CEO's brand DNA — the single source of truth for:
- How they write (tone, sentence length, vocabulary level)
- What they talk about (authority topics)
- What they would NEVER say (forbidden phrases / anti-patterns)
- Concrete examples of their best content

BrandFragment is the granular knowledge base entry. Each fragment is a small
chunk of brand-relevant content (an example post, a key insight, a signature
phrase) stored in the vector store for semantic retrieval.

Design principle
----------------
The VoiceProfile is edited deliberately (the CEO curates it). BrandFragments
can be added incrementally as more content is produced. Both are immutable
once set — they can be replaced but not mutated in place, ensuring the brand
history is auditable.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class BrandFragmentCategory(str):
    """Classification for what type of brand content a fragment represents."""

    EXAMPLE_POST = "example_post"      # A LinkedIn/X post the CEO wrote
    KEY_INSIGHT = "key_insight"        # A belief or observation worth reusing
    SIGNATURE_PHRASE = "signature_phrase"  # A phrase the CEO uses often
    AUTHORITY_CONTENT = "authority_content"  # Deep-dive article or thread
    RESPONSE_TEMPLATE = "response_template"  # How they respond to comments/DMs


class VoiceProfile(TimestampMixin, table=True):
    """The CEO's brand DNA — curated and stored explicitly.

    There is exactly ONE active VoiceProfile per BEE deployment (for the CEO
    who owns the instance). Future multi-user support would add a user_id FK.
    """

    __tablename__ = "voice_profiles"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # ── Identity ───────────────────────────────────────────────────────────────
    display_name: str = Field(nullable=False, description="CEO's name as it appears on social")
    title: str | None = Field(default=None, description="Professional title shown in content")
    language: str = Field(default="en", description="Primary content language: 'en' | 'es'")

    # ── Voice characteristics ─────────────────────────────────────────────────
    # Stored as JSON arrays for flexibility — no schema migration needed for new traits.
    tone_descriptors: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="e.g. ['analytical', 'direct', 'empathetic', 'no-BS']",
    )
    authority_topics: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Domains the CEO speaks authoritatively about.",
    )
    forbidden_phrases: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Phrases that clash with the brand voice (anti-patterns).",
    )

    # ── Style constraints ─────────────────────────────────────────────────────
    max_sentence_words: int = Field(default=25, description="Target max words per sentence.")
    use_emojis: bool = Field(default=False, description="Whether to include emojis in content.")
    preferred_cta: str | None = Field(
        default=None,
        description="Preferred call-to-action phrasing (e.g. 'Let's talk.' vs 'Book a call').",
    )

    # ── Context for AI ────────────────────────────────────────────────────────
    bio_summary: str | None = Field(
        default=None,
        max_length=1000,
        description="1-2 paragraph summary of who the CEO is and their story.",
    )

    is_active: bool = Field(default=True, index=True)


class BrandFragment(TimestampMixin, table=True):
    """A granular piece of brand knowledge stored in the vector knowledge base.

    Each fragment is indexed by the VectorStore for semantic retrieval. The
    ``vector_doc_id`` links the DB record to its entry in the vector store.
    """

    __tablename__ = "brand_fragments"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)
    profile_id: uuid.UUID = Field(foreign_key="voice_profiles.id", index=True)

    # ── Content ───────────────────────────────────────────────────────────────
    content: str = Field(nullable=False, description="The actual text fragment.")
    category: str = Field(
        nullable=False,
        index=True,
        description="One of BrandFragmentCategory values.",
    )
    tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Topic tags for metadata filtering (e.g. ['SaaS', 'funding']).",
    )

    # ── Vector store link ─────────────────────────────────────────────────────
    vector_doc_id: str = Field(
        unique=True,
        index=True,
        description="The ID of the corresponding document in the IVectorStore.",
    )

    # ── Provenance ────────────────────────────────────────────────────────────
    source: str | None = Field(default=None, description="Where this fragment came from (e.g. 'linkedin_post', 'manual').")
    performance_score: float | None = Field(
        default=None,
        description="Engagement score from original post (0-100), if known.",
    )
    used_count: int = Field(default=0, description="How many times this fragment was retrieved and used.")
    last_used_at: datetime | None = Field(default=None)

    def mark_used(self) -> None:
        self.used_count += 1
        self.last_used_at = datetime.now(UTC)
