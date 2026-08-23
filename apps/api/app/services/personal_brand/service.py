"""PersonalBrandService — the CEO's Voice Brain.

This service manages the brand knowledge repository and provides contextual
brand intelligence to all content-generating services (ExecutiveAgent,
SmartEngagementEngine, OmnichannelGateway).

How it connects to the VectorKnowledgeBase
------------------------------------------
Every BrandFragment stored here is simultaneously:
1. Saved to the relational DB (for full CRUD, search by tags, audit trail)
2. Embedded and indexed in the IVectorStore (for semantic similarity search)

When the ExecutiveAgent or SmartEngagementEngine needs to generate content,
it calls ``get_brand_context(query, top_k)`` which:
1. Embeds the query into the same vector space
2. Retrieves the top_k most semantically similar BrandFragments
3. Packages the VoiceProfile + fragments into a ``brand_brief`` string
4. Returns the brief for injection into the generation prompt

This ensures ALL AI-generated content (emails, posts, responses) is grounded
in the CEO's actual voice — not generic AI output.

LLM upgrade path
----------------
``generate_brand_brief()`` currently uses template strings. When an LLM is
configured (``AI_PROVIDER != "none"``), this method can call the LLM with
the retrieved fragments as context to produce a richer brief. No service-level
changes needed — just upgrade this method.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.brand_profile import BrandFragment, VoiceProfile
from app.schemas.brand import (
    BrandContextResult,
    BrandFragmentCreate,
    BrandFragmentOut,
    VoiceProfileCreate,
    VoiceProfileOut,
)
from app.services.permissions import scope_by_organization_id as _scope
from app.services.vector_store import IVectorStore, ScoredDocument

logger = get_logger(__name__)

_BRIEF_HEADER = """
## CEO Voice Profile

**Name**: {name}
**Tone**: {tone}
**Authority topics**: {topics}
**Do NOT use these phrases**: {forbidden}
**Writing style**: max {max_words} words per sentence. Emojis: {emojis}.
{cta_line}

## Relevant reference fragments (retrieved by semantic similarity)

{fragments}

---
Write content that sounds exactly like this person. Be specific and direct.
Never use jargon or corporate-speak. Mirror the tone and vocabulary above.
"""


class PersonalBrandService:
    """Central hub for CEO brand voice management and retrieval."""

    def __init__(self, session: Session, vector_store: IVectorStore) -> None:
        self.session = session
        self._store = vector_store

    # ── VoiceProfile management ───────────────────────────────────────────────

    def create_or_update_profile(
        self, data: VoiceProfileCreate, organization_id: uuid.UUID | None = None
    ) -> VoiceProfile:
        """Create a new VoiceProfile or replace the existing active one.

        "The existing active one" is scoped per-organization — each tenant
        has its own single active voice profile, not one shared globally.
        """
        existing_stmt = _scope(
            select(VoiceProfile).where(VoiceProfile.is_active),
            VoiceProfile.organization_id,
            organization_id,
        )
        existing = self.session.exec(existing_stmt).all()
        for prof in existing:
            prof.is_active = False
            self.session.add(prof)

        profile = VoiceProfile(
            organization_id=organization_id,
            display_name=data.display_name,
            title=data.title,
            language=data.language,
            tone_descriptors=data.tone_descriptors,
            authority_topics=data.authority_topics,
            forbidden_phrases=data.forbidden_phrases,
            max_sentence_words=data.max_sentence_words,
            use_emojis=data.use_emojis,
            preferred_cta=data.preferred_cta,
            bio_summary=data.bio_summary,
        )
        self.session.add(profile)
        self.session.flush()
        self.session.refresh(profile)
        logger.info("VoiceProfile created: id=%s name=%s", profile.id, profile.display_name)
        return profile

    def get_active_profile(self, organization_id: uuid.UUID | None = None) -> VoiceProfile | None:
        stmt = _scope(
            select(VoiceProfile).where(VoiceProfile.is_active), VoiceProfile.organization_id, organization_id
        )
        return self.session.exec(stmt).first()

    # ── BrandFragment management ───────────────────────────────────────────────

    def add_fragment(
        self,
        profile_id: uuid.UUID,
        data: BrandFragmentCreate,
        organization_id: uuid.UUID | None = None,
    ) -> BrandFragment | None:
        """Store a brand fragment in both the DB and the vector store.

        Returns ``None`` (rather than raising) when ``profile_id`` doesn't
        exist or belongs to another organization, so the endpoint can 404
        without confirming a cross-tenant profile id exists.
        """
        profile = self.session.get(VoiceProfile, profile_id)
        if profile is None or (
            organization_id is not None
            and profile.organization_id is not None
            and profile.organization_id != organization_id
        ):
            return None

        vector_doc_id = f"frag_{uuid.uuid4().hex}"

        # Upsert into vector store
        metadata: dict[str, Any] = {
            "profile_id": str(profile_id),
            "category": data.category,
            "tags": data.tags,
        }
        self._store.upsert(vector_doc_id, data.content, metadata)

        fragment = BrandFragment(
            organization_id=organization_id,
            profile_id=profile_id,
            content=data.content,
            category=data.category,
            tags=data.tags,
            source=data.source,
            performance_score=data.performance_score,
            vector_doc_id=vector_doc_id,
        )
        self.session.add(fragment)
        self.session.flush()
        self.session.refresh(fragment)
        logger.info(
            "BrandFragment added: id=%s category=%s tags=%s",
            fragment.id, fragment.category, fragment.tags,
        )
        return fragment

    def list_fragments(
        self,
        profile_id: uuid.UUID,
        category: str | None = None,
        limit: int = 50,
        organization_id: uuid.UUID | None = None,
    ) -> list[BrandFragment]:
        stmt = select(BrandFragment).where(BrandFragment.profile_id == profile_id)
        if category:
            stmt = stmt.where(BrandFragment.category == category)
        stmt = _scope(stmt, BrandFragment.organization_id, organization_id)
        stmt = stmt.limit(limit).order_by(BrandFragment.created_at.desc())
        return list(self.session.exec(stmt).all())

    def delete_fragment(self, fragment_id: uuid.UUID, organization_id: uuid.UUID | None = None) -> bool:
        """Remove fragment from DB and vector store."""
        frag = self.session.get(BrandFragment, fragment_id)
        if not frag:
            return False
        if (
            organization_id is not None
            and frag.organization_id is not None
            and frag.organization_id != organization_id
        ):
            return False
        self._store.delete(frag.vector_doc_id)
        self.session.delete(frag)
        self.session.flush()
        return True

    # ── Brand context retrieval (the core intelligence method) ─────────────────

    def get_brand_context(
        self,
        query: str,
        top_k: int = 5,
        category_filter: str | None = None,
        tag_filter: list[str] | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> BrandContextResult:
        """Retrieve relevant brand context for a given query.

        1. Semantic search over all brand fragments
        2. Optionally filter by category or tags
        3. Build the brand brief for AI prompt injection

        Args:
            query:           What the content generation is about.
            top_k:           Number of fragments to retrieve.
            category_filter: Limit search to this category.
            tag_filter:      Limit search to fragments with these tags.
            organization_id: Which tenant's active voice profile to use.

        Returns:
            A :class:`BrandContextResult` ready for injection into AI prompts.
        """
        profile = self.get_active_profile(organization_id)
        if not profile:
            return BrandContextResult(
                voice_profile=None,
                relevant_fragments=[],
                brand_brief="No brand profile configured. Generate content with a neutral professional tone.",
                fragment_count_total=0,
            )

        # Vector search — scoped to this org's active profile (the vector
        # store is a single shared index across all tenants, so without this
        # a semantic match could surface another organization's fragment).
        metadata_filter: dict[str, Any] = {"profile_id": str(profile.id)}
        if category_filter:
            metadata_filter["category"] = category_filter

        scored_docs: list[ScoredDocument] = self._store.query(query, top_k=top_k, filter_metadata=metadata_filter)

        # Tag filtering (post-retrieval)
        if tag_filter:
            scored_docs = [
                d for d in scored_docs
                if any(t in d.metadata.get("tags", []) for t in tag_filter)
            ]

        # Resolve DB fragments from scored docs. This is also the isolation
        # backstop for PgVectorStore specifically: its query() ignores
        # filter_metadata entirely (pgvector has no per-row metadata index),
        # so the vector search itself can surface another organization's
        # fragment id — belongs-to-this-profile is re-checked here before
        # anything reaches the brief, even though it costs a few dropped
        # results when that happens.
        fragments: list[BrandFragment] = []
        for doc in scored_docs:
            frag = self.session.exec(
                select(BrandFragment).where(
                    BrandFragment.vector_doc_id == doc.id, BrandFragment.profile_id == profile.id
                )
            ).first()
            if frag:
                frag.mark_used()
                self.session.add(frag)
                fragments.append(frag)

        if fragments:
            self.session.flush()

        total = self.session.exec(
            select(BrandFragment).where(BrandFragment.profile_id == profile.id)
        ).all()

        brief = self._build_brief(profile, fragments)
        frag_outs = [BrandFragmentOut.model_validate(f) for f in fragments]
        profile_out = VoiceProfileOut.model_validate(profile)

        return BrandContextResult(
            voice_profile=profile_out,
            relevant_fragments=frag_outs,
            brand_brief=brief,
            fragment_count_total=len(total),
        )

    def generate_brand_brief(
        self, artifact_type: str = "general", topic: str = "", organization_id: uuid.UUID | None = None
    ) -> str:
        """Quick brief for prompt injection without returning full context object."""
        context = self.get_brand_context(query=topic or artifact_type, top_k=3, organization_id=organization_id)
        return context.brand_brief

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _build_brief(self, profile: VoiceProfile, fragments: list[BrandFragment]) -> str:
        """Build the brand brief string for AI prompt injection."""
        tone = ", ".join(profile.tone_descriptors) if profile.tone_descriptors else "professional"
        topics = ", ".join(profile.authority_topics[:5]) if profile.authority_topics else "general business"
        forbidden = ", ".join(f'"{p}"' for p in profile.forbidden_phrases[:5]) if profile.forbidden_phrases else "none"
        cta_line = f'**Preferred CTA**: "{profile.preferred_cta}"' if profile.preferred_cta else ""
        emojis = "yes" if profile.use_emojis else "no"

        if fragments:
            frags_text = "\n\n".join(
                f"[{f.category.upper()} — score {f.performance_score or 'N/A'}]\n{f.content}"
                for f in fragments[:3]
            )
        else:
            frags_text = "No reference fragments yet. Use tone descriptors and authority topics as guides."

        return _BRIEF_HEADER.format(
            name=profile.display_name,
            tone=tone,
            topics=topics,
            forbidden=forbidden,
            max_words=profile.max_sentence_words,
            emojis=emojis,
            cta_line=cta_line,
            fragments=frags_text,
        ).strip()
