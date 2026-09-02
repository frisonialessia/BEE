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

import re
import uuid
from collections import Counter
from typing import Any

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.brand_profile import BrandFragment, VoiceProfile
from app.schemas.brand import (
    BrandContextResult,
    BrandFragmentCreate,
    BrandFragmentOut,
    BrandVoicePreviewResult,
    VoiceProfileCreate,
    VoiceProfileExtractResult,
    VoiceProfileOut,
)
from app.services.permissions import scope_by_organization_id as _scope
from app.services.strategy_generator.llm_prompt import parse_llm_response
from app.services.vector_store import IVectorStore, ScoredDocument

logger = get_logger(__name__)

_EXTRACTION_SYSTEM_PROMPT = """You analyze writing samples (emails, LinkedIn \
posts, past sales outreach) and propose a brand voice profile for the person \
who wrote them. Respond with ONLY a JSON object, no prose, no markdown fences:

{
  "title": "their likely professional title, or null if not inferable",
  "tone_descriptors": ["3-5 short adjectives describing HOW they write, e.g. \
'direct', 'data-driven', 'warm'"],
  "authority_topics": ["3-6 topics/domains they clearly write with authority \
about, drawn from the actual samples"],
  "preferred_cta": "their most natural closing call-to-action, or null",
  "bio_summary": "a 1-2 sentence third-person bio synthesized from the \
samples, or null"
}

Ground every field in what the samples actually contain. Never invent \
credentials, companies, or achievements the samples don't mention."""

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
    "been", "to", "of", "in", "on", "for", "with", "that", "this", "it", "as",
    "at", "by", "from", "we", "our", "you", "your", "i", "they", "their",
    "he", "she", "his", "her", "its", "not", "have", "has", "had", "will",
    "would", "can", "could", "should", "about", "into", "up", "out", "if",
    "so", "than", "then", "just", "also", "more", "most", "very", "get",
    "got", "us", "them", "what", "when", "how", "all", "there", "some",
}
_CTA_KEYWORDS = (
    "schedule", "book a", "let's talk", "let's chat", "reach out", "reply",
    "call this week", "worth a chat", "grab time", "grab 15", "happy to",
    "would you", "would love", "make sense",
)

_GENERIC_PREVIEW_SYSTEM_PROMPT = """Write a short LinkedIn post opener \
(2-3 sentences) about the given topic. Professional, neutral, corporate \
tone — the kind of generic AI-generated post seen everywhere. No specific \
voice or personality. Respond with ONLY the post text, no quotes, no \
preamble."""

_BRANDED_PREVIEW_SYSTEM_PROMPT_TEMPLATE = """Write a short LinkedIn post \
opener (2-3 sentences) about the given topic, in EXACTLY this voice:

{brand_brief}

Respond with ONLY the post text, no quotes, no preamble."""

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
        self.settings = get_settings()

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

    # ── AI-assisted extraction ──────────────────────────────────────────────

    def extract_profile_draft(self, raw_text: str) -> VoiceProfileExtractResult:
        """Propose a VoiceProfile draft from pasted writing samples.

        Same "never lose the request" contract as AccountResearchAgent's
        _synthesize: try the LLM when one is configured, and on ANY failure
        (timeout, bad response, no API key, AI_PROVIDER=none) fall back to a
        deterministic heuristic extractor instead of raising. The result is
        never persisted here — it's a draft the caller reviews/edits before
        calling create_or_update_profile.
        """
        if self.settings.AI_PROVIDER in ("openai", "anthropic") and self.settings.AI_API_KEY:
            try:
                fields = self._call_llm_extraction(raw_text)
                model = (
                    self.settings.AI_MODEL
                    if self.settings.AI_PROVIDER == "openai"
                    else self.settings.ANTHROPIC_MODEL
                )
                return VoiceProfileExtractResult(
                    title=fields.get("title"),
                    tone_descriptors=list(fields.get("tone_descriptors") or []),
                    authority_topics=list(fields.get("authority_topics") or []),
                    preferred_cta=fields.get("preferred_cta"),
                    bio_summary=fields.get("bio_summary"),
                    generated_by="llm",
                    model_used=model,
                )
            except Exception:  # noqa: BLE001 — never lose the request, fall back instead
                logger.exception("PersonalBrandService: LLM extraction failed, falling back to heuristic")

        return self._heuristic_extract(raw_text)

    def _call_llm_extraction(self, raw_text: str) -> dict[str, Any]:
        provider = self.settings.AI_PROVIDER
        user_prompt = f"Writing samples:\n\n{raw_text}"

        if provider == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=self.settings.AI_API_KEY, timeout=self.settings.AI_TIMEOUT_SECONDS)
            resp = client.chat.completions.create(
                model=self.settings.AI_MODEL,
                messages=[
                    {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=500,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or ""
        elif provider == "anthropic":
            import anthropic

            client = anthropic.Anthropic(api_key=self.settings.AI_API_KEY, timeout=self.settings.AI_TIMEOUT_SECONDS)
            resp = client.messages.create(
                model=self.settings.ANTHROPIC_MODEL,
                max_tokens=500,
                temperature=0.3,
                system=_EXTRACTION_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = resp.content[0].text if resp.content else ""
        else:
            raise ValueError(f"Unsupported AI_PROVIDER: {provider}")

        return parse_llm_response(raw)

    def _heuristic_extract(self, raw_text: str) -> VoiceProfileExtractResult:
        """Offline fallback — always available, zero cost, no external call.

        Deterministic, defensible signals only: tone descriptors come from
        measurable text statistics (punctuation, sentence length), authority
        topics from words the samples actually repeat, bio_summary and
        preferred_cta from sentences the samples actually contain. Never
        invents anything not present in raw_text — same honesty rule the
        sandbox's demo synthesis already follows (see demoResearchCompany).
        """
        text = raw_text.strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        words = re.findall(r"[A-Za-z][A-Za-z'-]+", text)

        tone: list[str] = []
        exclaim_ratio = text.count("!") / max(len(sentences), 1)
        if exclaim_ratio > 0.15:
            tone.append("energetic")
        if "?" in text:
            tone.append("conversational")
        avg_sentence_words = len(words) / max(len(sentences), 1)
        if avg_sentence_words <= 12:
            tone.append("concise")
        elif avg_sentence_words >= 22:
            tone.append("detailed")
        if re.search(r"\d", text):
            tone.append("data-driven")
        if not tone:
            tone.append("professional")

        # Authority topics: capitalized multi-letter words that recur (likely
        # proper nouns — product/company/domain names) beat generic frequent
        # words, since they're the strongest signal of what this person
        # actually writes about with authority.
        capitalized = [w for w in words if w[0].isupper() and w.lower() not in _STOPWORDS and len(w) > 2]
        cap_counts = Counter(w for w in capitalized)
        topics = [w for w, count in cap_counts.most_common(6) if count >= 2]
        if len(topics) < 3:
            lower_counts = Counter(w.lower() for w in words if w.lower() not in _STOPWORDS and len(w) > 3)
            for word, _count in lower_counts.most_common(10):
                if word not in (t.lower() for t in topics):
                    topics.append(word)
                if len(topics) >= 5:
                    break

        cta = next(
            (s for s in reversed(sentences) if any(k in s.lower() for k in _CTA_KEYWORDS)),
            None,
        )

        bio_summary = sentences[0][:280] if sentences else None

        return VoiceProfileExtractResult(
            title=None,
            tone_descriptors=tone[:5],
            authority_topics=topics[:5],
            preferred_cta=cta,
            bio_summary=bio_summary,
            generated_by="heuristic",
            model_used=None,
        )

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

    # ── Live preview: generic vs. voice-applied ─────────────────────────────

    def generate_preview(
        self, topic: str, organization_id: uuid.UUID | None = None
    ) -> BrandVoicePreviewResult | None:
        """A short side-by-side sample on `topic`: what a generic AI tool
        would write vs. what this org's own voice actually changes about it.

        Returns None when there's no active profile yet — nothing to apply.
        Never persisted; purely a live, on-demand comparison. Same "never
        lose the request" contract as extract_profile_draft: tries the LLM
        when configured, falls back to a deterministic template on any
        failure (or when AI_PROVIDER=none) so this never raises.
        """
        context = self.get_brand_context(query=topic, top_k=3, organization_id=organization_id)
        active_profile = context.voice_profile
        if active_profile is None:
            return None

        if self.settings.AI_PROVIDER in ("openai", "anthropic") and self.settings.AI_API_KEY:
            try:
                generic = self._call_llm_text(_GENERIC_PREVIEW_SYSTEM_PROMPT, topic)
                branded_system = _BRANDED_PREVIEW_SYSTEM_PROMPT_TEMPLATE.format(brand_brief=context.brand_brief)
                branded = self._call_llm_text(branded_system, topic)
                model = (
                    self.settings.AI_MODEL
                    if self.settings.AI_PROVIDER == "openai"
                    else self.settings.ANTHROPIC_MODEL
                )
                return BrandVoicePreviewResult(
                    topic=topic,
                    generic_version=generic,
                    branded_version=branded,
                    generated_by="llm",
                    model_used=model,
                )
            except Exception:  # noqa: BLE001 — never lose the request, fall back instead
                logger.exception("PersonalBrandService: LLM preview failed, falling back to template")

        return BrandVoicePreviewResult(
            topic=topic,
            generic_version=self._template_generic_preview(topic),
            branded_version=self._template_branded_preview(topic, active_profile),
            generated_by="template",
            model_used=None,
        )

    def build_voice_snippet(self, topic: str, organization_id: uuid.UUID | None = None) -> str | None:
        """A short, on-brand one-liner for `topic` — deterministic, no LLM
        call. For high-frequency call sites (e.g. DynamicSequenceEngine
        building a PendingAction preview on every step advance) where an LLM
        round-trip per call isn't worth the cost or latency. Returns None
        when there's no active profile — callers keep their own fallback.
        """
        profile = self.get_active_profile(organization_id)
        if profile is None:
            return None
        return self._template_branded_preview(topic, VoiceProfileOut.model_validate(profile))

    def _call_llm_text(self, system_prompt: str, topic: str) -> str:
        """Plain-text (not JSON-mode) LLM call — same provider branching as
        _call_llm_extraction, but the preview wants prose, not structured
        fields."""
        provider = self.settings.AI_PROVIDER
        user_prompt = f"Topic: {topic}"

        if provider == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=self.settings.AI_API_KEY, timeout=self.settings.AI_TIMEOUT_SECONDS)
            resp = client.chat.completions.create(
                model=self.settings.AI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.6,
                max_tokens=200,
            )
            return (resp.choices[0].message.content or "").strip()
        if provider == "anthropic":
            import anthropic

            client = anthropic.Anthropic(api_key=self.settings.AI_API_KEY, timeout=self.settings.AI_TIMEOUT_SECONDS)
            resp = client.messages.create(
                model=self.settings.ANTHROPIC_MODEL,
                max_tokens=200,
                temperature=0.6,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return (resp.content[0].text if resp.content else "").strip()
        raise ValueError(f"Unsupported AI_PROVIDER: {provider}")

    def _template_generic_preview(self, topic: str) -> str:
        return (
            f"Excited to share some thoughts on {topic}. We're committed to "
            "delivering value and driving results for our customers. Let's "
            "connect if this resonates with you!"
        )

    def _template_branded_preview(self, topic: str, profile: VoiceProfileOut) -> str:
        tone = profile.tone_descriptors[0] if profile.tone_descriptors else None
        lead_topic = profile.authority_topics[0] if profile.authority_topics else None
        emoji = " 🔥" if profile.use_emojis else ""

        parts = [f"{topic.capitalize()}.{emoji}"]
        if lead_topic:
            parts.append(f"This is exactly the kind of thing we obsess over in {lead_topic}.")
        if tone:
            parts.append(f"(Written {tone} — no filler, no jargon.)")
        if profile.preferred_cta:
            parts.append(profile.preferred_cta)
        return " ".join(parts)

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
