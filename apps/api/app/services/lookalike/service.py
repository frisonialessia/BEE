"""LookalikeService — "companies like your best customers", powered by the
vector store BEE already runs for FeedbackLoopService and PersonalBrandService
(see ``app.services.vector_store``).

The pitch: a generic CRM only ever shows you the accounts a human typed in.
BEE already knows — from real signals it detected and real deals that actually
closed — what a good-fit account looks like for *this specific organization*.
This service turns that into a concrete, ranked shortlist: net-new companies
BEE is already tracking (from inbound signal ingestion) that resemble the
accounts which previously converted, before a human ever has to go looking.

How it works
------------
1. "What worked": every company with at least one WON opportunity, turned
   into a short firmographic profile string (industry, size, country,
   description).
2. "Untapped pool": every company with zero opportunities at all — nobody's
   working these yet, so a match here is a genuinely new lead, not a nudge to
   revisit something already in play.
3. Upsert the untapped pool into the shared ``IVectorStore`` (org-scoped
   metadata, so tenants never see each other's candidates) and query it with
   the "what worked" text. Same cosine-similarity retrieval engine the
   feedback loop and personal-brand search already use — no new
   infrastructure, no extra external dependency, and no LLM call, so it
   degrades the same way the rest of the vector-store abstraction does: real
   semantic matches with ``pgvector`` + embeddings configured in production,
   honest keyword-overlap matches from ``MockVectorStore`` everywhere else
   (dev, CI, an org that hasn't configured ``AI_API_KEY``).

An organization with no won deals yet has nothing to learn from — this
returns an empty list rather than a guess, same honesty guardrail
``FeedbackLoopService.get_patterns`` documents for its own minimum-sample
floor.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlmodel import Session, select

from app.models.base import OpportunityStatus
from app.models.company import Company
from app.models.opportunity import Opportunity
from app.services.permissions import scope_by_organization_id
from app.services.vector_store import get_vector_store

# Below this many won deals, "what a good account looks like" is one or two
# anecdotes, not a pattern — same spirit as FeedbackLoopService's confidence
# tiers, kept as a hard floor here since there's no partial-confidence UI for
# this feature (a lookalike either ships as a solid suggestion or not at all).
MIN_WON_COMPANIES = 1

_DOC_PREFIX = "lookalike_company:"


@dataclass(slots=True)
class LookalikeResult:
    """One candidate company, ranked by resemblance to the org's closed-won book."""

    company_id: uuid.UUID
    name: str
    industry: str | None
    size: str | None
    country: str | None
    similarity: float  # 0 (no resemblance) .. 1 (near-identical profile)


class LookalikeService:
    """Finds untapped companies that resemble an organization's closed-won accounts."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self._store = get_vector_store()

    def find(
        self, organization_id: uuid.UUID | None, limit: int = 8
    ) -> list[LookalikeResult]:
        won_companies = self._won_companies(organization_id)
        if len(won_companies) < MIN_WON_COMPANIES:
            return []

        prospects = self._untapped_companies(organization_id)
        if not prospects:
            return []

        org_key = str(organization_id) if organization_id else "none"
        for company in prospects:
            self._store.upsert(
                f"{_DOC_PREFIX}{company.id}",
                self._profile_text(company),
                metadata={
                    "type": "lookalike_company",
                    "organization_id": org_key,
                    "company_id": str(company.id),
                },
            )

        query_text = " ".join(self._profile_text(c) for c in won_companies)
        scored = self._store.query(
            query_text,
            top_k=limit,
            filter_metadata={"type": "lookalike_company", "organization_id": org_key},
        )

        by_id = {c.id: c for c in prospects}
        results: list[LookalikeResult] = []
        for doc in scored:
            if not doc.is_relevant:
                continue
            matched = by_id.get(uuid.UUID(doc.metadata["company_id"]))
            if matched is None:
                continue
            results.append(
                LookalikeResult(
                    company_id=matched.id,
                    name=matched.name,
                    industry=matched.industry,
                    size=matched.size,
                    country=matched.country,
                    similarity=doc.score,
                )
            )
        return results

    # ── Queries ──────────────────────────────────────────────────────────────

    def _won_companies(self, organization_id: uuid.UUID | None) -> list[Company]:
        stmt = (
            select(Company)
            .join(Opportunity, Opportunity.company_id == Company.id)
            .where(Opportunity.status == OpportunityStatus.WON)
        )
        stmt = scope_by_organization_id(stmt, Company.organization_id, organization_id)
        return self._dedupe(list(self.session.exec(stmt).all()))

    def _untapped_companies(self, organization_id: uuid.UUID | None) -> list[Company]:
        """Companies with zero opportunities — nobody's already working these."""
        worked_ids = select(Opportunity.company_id).where(Opportunity.company_id.is_not(None))
        stmt = select(Company).where(Company.id.not_in(worked_ids))
        stmt = scope_by_organization_id(stmt, Company.organization_id, organization_id)
        return self._dedupe(list(self.session.exec(stmt).all()))

    @staticmethod
    def _dedupe(companies: list[Company]) -> list[Company]:
        seen: dict[uuid.UUID, Company] = {}
        for c in companies:
            seen.setdefault(c.id, c)
        return list(seen.values())

    @staticmethod
    def _profile_text(company: Company) -> str:
        parts = [
            company.industry or "",
            company.size or "",
            company.country or "",
            company.revenue_range or "",
            company.description or "",
        ]
        return " ".join(p for p in parts if p) or company.name
