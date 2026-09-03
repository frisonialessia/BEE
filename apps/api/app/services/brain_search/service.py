"""BrainSearchService — one natural-language search box over everything BEE
already knows about an organization: signals, companies, and opportunities
(including the AI-generated strategy attached to each). Same shared
``IVectorStore`` FeedbackLoopService, PersonalBrandService and
LookalikeService already use — see ``app.services.vector_store``.

Why this, and why now
----------------------
Apollo/ZoomInfo search *contacts*. Gong/Clari search *call transcripts*.
Neither searches across an org's own detected signals, tracked accounts and
generated strategies as one corpus — that corpus only exists inside BEE, so
this is a genuinely new surface, not a caught-up feature.

Zero cost today, upgrades for free later
-----------------------------------------
This runs entirely on ``MockVectorStore`` — in-memory keyword/TF cosine
similarity, no network call, no ``AI_API_KEY`` required — so it works today
with nothing connected and nothing to pay for. The moment an operator sets
``VECTOR_STORE_BACKEND=pgvector`` (+ configures real embeddings), results get
strictly better — same query, same response shape, zero code changes here.
See ``app.services.vector_store``'s own "swap rule" docstring.

Re-indexing cost
-----------------
A search box gets hit far more often than, say, LookalikeService's
once-per-page-load query — so, unlike that service, this one does NOT
re-embed the org's entire dataset on every keystroke. ``_INDEX_TTL`` caps
that to once per organization per window; the debounce on the frontend
caps how often a keystroke even reaches this service in the first place.
Once real (paid) embeddings are wired in, this cap is what keeps that a
predictable, bounded cost instead of "one embedding call per character
typed."
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlmodel import Session, select

from app.models.company import Company
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.services.permissions import scope_by_organization_id
from app.services.vector_store import get_vector_store

BrainEntityType = Literal["signal", "company", "opportunity"]

_DOC_PREFIX = "brain_search:"
# Enough rows per entity type for "search everything a growing org has" without
# turning every search into an unbounded table scan — same ceiling
# CommandPalette's own pre-existing client-side index already uses (200 rows).
_INDEX_LIMIT = 300
# How long a per-organization index stays fresh before the next search
# triggers a re-embed. Deliberately not "on every request" — see this
# module's docstring on re-indexing cost.
_INDEX_TTL = timedelta(minutes=5)

# In-process cache of "when did we last (re)index this org's documents into
# the vector store" — module-level, same "resets on restart, that's fine"
# contract as the vector store singleton itself (app.services.vector_store).
_last_indexed_at: dict[str, datetime] = {}


@dataclass(slots=True)
class BrainSearchResult:
    entity_type: BrainEntityType
    entity_id: uuid.UUID
    title: str
    snippet: str
    score: float


class BrainSearchService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self._store = get_vector_store()

    def search(
        self, organization_id: uuid.UUID, query: str, limit: int = 10
    ) -> list[BrainSearchResult]:
        query = query.strip()
        if not query:
            return []

        org_key = str(organization_id)
        catalog = self._ensure_indexed(organization_id, org_key)

        scored = self._store.query(
            query,
            top_k=limit,
            filter_metadata={"type": "brain_search", "organization_id": org_key},
        )

        results: list[BrainSearchResult] = []
        for doc in scored:
            if not doc.is_relevant:
                continue
            meta = catalog.get(doc.id)
            if meta is None:
                continue
            entity_type, entity_id, title, snippet = meta
            results.append(
                BrainSearchResult(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    title=title,
                    snippet=snippet,
                    score=doc.score,
                )
            )
        return results

    # ── Indexing ─────────────────────────────────────────────────────────────

    def _ensure_indexed(
        self, organization_id: uuid.UUID, org_key: str
    ) -> dict[str, tuple[BrainEntityType, uuid.UUID, str, str]]:
        """Upsert this org's searchable documents if the cached index has
        gone stale, and return the doc_id → entity lookup table either way
        (rebuilt from the DB on every call — cheap, unlike the embedding
        itself — so a lookup is always correct even between reindexes)."""
        last = _last_indexed_at.get(org_key)
        stale = last is None or (datetime.now(UTC) - last) > _INDEX_TTL

        catalog: dict[str, tuple[BrainEntityType, uuid.UUID, str, str]] = {}

        for signal in self._signals(organization_id):
            doc_id = f"{_DOC_PREFIX}signal:{signal.id}"
            snippet = (signal.description or "")[:200]
            catalog[doc_id] = ("signal", signal.id, signal.title, snippet)
            if stale:
                content = f"{signal.title} {signal.description or ''} {signal.signal_type.value}"
                self._store.upsert(
                    doc_id,
                    content,
                    metadata={"type": "brain_search", "organization_id": org_key},
                )

        for company in self._companies(organization_id):
            doc_id = f"{_DOC_PREFIX}company:{company.id}"
            snippet = ", ".join(p for p in (company.industry, company.country) if p)
            catalog[doc_id] = ("company", company.id, company.name, snippet)
            if stale:
                content = " ".join(
                    p
                    for p in (
                        company.name,
                        company.industry,
                        company.country,
                        company.description,
                    )
                    if p
                )
                self._store.upsert(
                    doc_id,
                    content,
                    metadata={"type": "brain_search", "organization_id": org_key},
                )

        for opp in self._opportunities(organization_id):
            doc_id = f"{_DOC_PREFIX}opportunity:{opp.id}"
            snippet = str(opp.strategy.get("pain_point") or opp.strategy.get("closing_argument") or "")[
                :200
            ]
            catalog[doc_id] = ("opportunity", opp.id, opp.title, snippet)
            if stale:
                content = " ".join(
                    str(v)
                    for v in (
                        opp.title,
                        opp.strategy.get("pain_point"),
                        opp.strategy.get("closing_argument"),
                        opp.strategy.get("playbook"),
                    )
                    if v
                )
                self._store.upsert(
                    doc_id,
                    content,
                    metadata={"type": "brain_search", "organization_id": org_key},
                )

        if stale:
            _last_indexed_at[org_key] = datetime.now(UTC)

        return catalog

    def _signals(self, organization_id: uuid.UUID) -> list[Signal]:
        stmt = select(Signal).order_by(Signal.detected_at.desc()).limit(_INDEX_LIMIT)
        stmt = scope_by_organization_id(stmt, Signal.organization_id, organization_id)
        return list(self.session.exec(stmt).all())

    def _companies(self, organization_id: uuid.UUID) -> list[Company]:
        stmt = select(Company).order_by(Company.created_at.desc()).limit(_INDEX_LIMIT)
        stmt = scope_by_organization_id(stmt, Company.organization_id, organization_id)
        return list(self.session.exec(stmt).all())

    def _opportunities(self, organization_id: uuid.UUID) -> list[Opportunity]:
        stmt = select(Opportunity).order_by(Opportunity.created_at.desc()).limit(_INDEX_LIMIT)
        stmt = scope_by_organization_id(stmt, Opportunity.organization_id, organization_id)
        return list(self.session.exec(stmt).all())


def reset_brain_search_cache() -> None:
    """Clear the in-process reindex cache. Test isolation only — mirrors
    ``app.services.vector_store.reset_vector_store``."""
    _last_indexed_at.clear()
