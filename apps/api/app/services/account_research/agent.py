"""AccountResearchAgent — the "deep research per account" pipeline.

Distinct from MarketScanOrchestrator (app.services.market_scan): that
pipeline is cheap, per-tick, and runs eagerly on every company whose scan
cursor is due — appropriate because it's one narrow provider call per
tick. This agent is expensive (up to three provider calls plus, when
AI_PROVIDER is configured, an LLM synthesis) and is deliberately **never**
fired on a schedule or in bulk — see the trigger discipline below.

Trigger discipline (the cost-protection design)
-------------------------------------------------
1. **On-demand only.** Nothing calls ``research()`` automatically on
   company creation or import — a CSV import of 100 companies creates 100
   ``Company`` rows and zero research passes. The only call sites are an
   explicit action: ``POST /companies/{id}/research`` (a human clicking
   "Investigate this account") and reassigning a company's owner (see
   ``update_company`` in ``app.api.v1.endpoints.companies`` — a company
   getting a real owner is a much rarer, higher-intent event than being
   created).
2. **Strict cache.** A cached ``AccountBrief`` younger than
   ``ACCOUNT_RESEARCH_TTL_DAYS`` is returned as-is; no provider is called.
   At most one real research pass per company per TTL window, full stop.
3. **Per-organization daily budget.** ``ACCOUNT_RESEARCH_DAILY_BUDGET_PER_ORG``
   caps new briefs an organization can produce in a rolling 24h window,
   independent of the cache above — protects the shared provider rate
   limits (rate_limiter.py) and API/LLM cost from a burst of legitimate
   trigger events (e.g. bulk-reassigning ownership after a territory
   change). Hitting the cap returns the most recent cached brief (possibly
   stale, possibly ``None``) rather than failing the action that
   triggered it — a budget-exhausted research pass is postponed, never a
   hard error.
4. **Off by default.** ``ACCOUNT_RESEARCH_ENABLED=false`` is the default,
   same safe-rollout convention as ``MARKET_SCAN_ENABLED`` — the trigger
   endpoints and cache/budget plumbing can be deployed and exercised
   before any real provider call is turned on.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.account_brief import AccountBrief
from app.models.base import utcnow
from app.models.company import Company
from app.services.external_api.orchestrator import ExternalAPIOrchestrator

logger = get_logger(__name__)

# Every fact handed to the LLM must come from here — the prompt below
# instructs it to summarize ONLY this JSON, never add outside knowledge.
# Same "zero invented data" discipline as GoogleSearchProvider's mock mode.
_SYNTHESIS_SYSTEM_PROMPT = """You are a B2B sales research analyst.
Summarize the account research findings below in 3-4 concise sentences for
a sales rep about to reach out. Rules:
1. Use ONLY facts present in the findings JSON — never add information you
   were not given, never guess at industry, size, or funding not present.
2. If findings are sparse, say so plainly rather than padding with filler.
3. Write in plain prose, no markdown, no bullet points.
4. End with one sentence suggesting why NOW is a reasonable moment to reach
   out, grounded strictly in the findings (or omit this if nothing supports it)."""


@dataclass(slots=True)
class ResearchOutcome:
    """What one research() call did — also what its caller returns to the client."""

    brief: AccountBrief | None
    from_cache: bool
    budget_exceeded: bool = False
    disabled: bool = False


class AccountResearchAgent:
    """Deep, on-demand, multi-provider research pass for one company."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.settings = get_settings()

    def research(
        self,
        company: Company,
        *,
        organization_id: uuid.UUID | None,
        force: bool = False,
        research_focus: str | None = None,
    ) -> ResearchOutcome:
        """Return a fresh-enough AccountBrief for *company*, running a new
        research pass only when the cache and budget both allow it.

        ``force=True`` skips the TTL cache check (still respects the daily
        budget) — used by the explicit "re-research this account" action,
        where a stale-but-present brief is not what the caller asked for.

        ``research_focus`` — the requesting user's TeamProfile.research_focus,
        when set (see TeamProfileService.get_research_focus) — steers the LLM
        synthesis toward what that team actually sells. Ignored on a cache
        hit (a cached brief was already synthesized, possibly under a
        different team's focus, but re-running research on every focus
        change would defeat the TTL cache's whole purpose).
        """
        if not self.settings.ACCOUNT_RESEARCH_ENABLED:
            return ResearchOutcome(brief=self._latest_brief(company.id), from_cache=True, disabled=True)

        if not force:
            fresh = self._fresh_brief(company.id)
            if fresh is not None:
                return ResearchOutcome(brief=fresh, from_cache=True)

        if not self._budget_available(organization_id):
            logger.warning(
                "AccountResearchAgent: daily budget exhausted org=%s company=%s",
                organization_id, company.id,
            )
            return ResearchOutcome(
                brief=self._latest_brief(company.id), from_cache=True, budget_exceeded=True
            )

        brief = self._run(company, organization_id, research_focus)
        return ResearchOutcome(brief=brief, from_cache=False)

    def get_latest_brief(self, company_id: uuid.UUID) -> AccountBrief | None:
        """Read-only lookup for GET endpoints — no cache/budget logic, just
        "what's the most recent brief, if any" (may be stale)."""
        return self._latest_brief(company_id)

    # ── Cache / budget reads — SQL-level date comparisons only. A Python-level
    # `brief.created_at > utcnow()` compare is exactly the offset-naive-vs-aware
    # trap SQLite's plain DateTime columns round-trip into (a datetime written
    # tz-aware comes back naive) — pushing every cutoff comparison into the
    # WHERE clause itself sidesteps that entirely, same fix applied to
    # MarketScanOrchestrator's own due-company query. ─────────────────────────

    def _latest_brief(self, company_id: uuid.UUID) -> AccountBrief | None:
        stmt = (
            select(AccountBrief)
            .where(AccountBrief.company_id == company_id)
            .order_by(AccountBrief.created_at.desc())
            .limit(1)
        )
        return self.session.exec(stmt).first()

    def _fresh_brief(self, company_id: uuid.UUID) -> AccountBrief | None:
        cutoff = utcnow() - timedelta(days=self.settings.ACCOUNT_RESEARCH_TTL_DAYS)
        stmt = (
            select(AccountBrief)
            .where(AccountBrief.company_id == company_id, AccountBrief.created_at >= cutoff)
            .order_by(AccountBrief.created_at.desc())
            .limit(1)
        )
        return self.session.exec(stmt).first()

    def _budget_available(self, organization_id: uuid.UUID | None) -> bool:
        if organization_id is None:
            # Untagged data has no per-org budget to exceed — same
            # backward-compatible convention as every optional
            # organization_id elsewhere in this codebase.
            return True
        cutoff = utcnow() - timedelta(hours=24)
        stmt = select(AccountBrief).where(
            AccountBrief.organization_id == organization_id, AccountBrief.created_at >= cutoff
        )
        count = len(self.session.exec(stmt).all())
        return count < self.settings.ACCOUNT_RESEARCH_DAILY_BUDGET_PER_ORG

    # ── The research pass itself ────────────────────────────────────────────

    def _run(
        self, company: Company, organization_id: uuid.UUID | None, research_focus: str | None = None
    ) -> AccountBrief:
        api = ExternalAPIOrchestrator(self.session)
        domain = company.domain or company.name
        findings: dict[str, Any] = {}
        sources: list[str] = []

        website = api.enrich_company_from_domain(company_domain=domain)
        if website.success and (website.company_name or website.company_description):
            findings["website"] = {
                "name": website.company_name,
                "description": website.company_description,
            }
            sources.append("website")

        hiring = api.scan_hiring_signals(company_domain=domain, company_name=company.name)
        if hiring.success and hiring.items:
            findings["hiring"] = {"items": hiring.items[:3]}
            sources.append("hiring")

        news = api.scan_market_news(company_domain=domain, company_name=company.name)
        if news.success and news.items:
            findings["market_news"] = {"items": news.items[:3]}
            sources.append("google_search")

        summary, generated_by, model_used = self._synthesize(company, findings, research_focus)

        brief = AccountBrief(
            organization_id=organization_id,
            company_id=company.id,
            summary=summary,
            findings=findings,
            sources=sources,
            generated_by=generated_by,
            model_used=model_used,
        )
        self.session.add(brief)
        self.session.commit()
        self.session.refresh(brief)
        logger.info(
            "AccountResearchAgent: brief generated company_id=%s sources=%s generated_by=%s",
            company.id, sources, generated_by,
        )
        return brief

    # ── Synthesis: LLM when configured, deterministic template otherwise ────

    def _synthesize(
        self, company: Company, findings: dict[str, Any], research_focus: str | None = None
    ) -> tuple[str, str, str | None]:
        if not findings:
            return (
                f"No public research found yet for {company.name} — the website, hiring "
                "board, and market news search all returned nothing usable.",
                "template",
                None,
            )

        if self.settings.AI_PROVIDER in ("openai", "anthropic") and self.settings.AI_API_KEY:
            try:
                summary = self._call_llm(company, findings, research_focus)
                model = (
                    self.settings.AI_MODEL
                    if self.settings.AI_PROVIDER == "openai"
                    else self.settings.ANTHROPIC_MODEL
                )
                return (summary, "llm", model)
            except Exception:  # noqa: BLE001 — never lose the research, fall back instead
                logger.exception(
                    "AccountResearchAgent: LLM synthesis failed for company_id=%s, "
                    "falling back to template",
                    company.id,
                )

        return (self._template_summary(company, findings), "template", None)

    def _template_summary(self, company: Company, findings: dict[str, Any]) -> str:
        parts: list[str] = []
        website = findings.get("website")
        if website and website.get("description"):
            parts.append(website["description"])
        hiring = findings.get("hiring")
        if hiring and hiring.get("items"):
            parts.append(hiring["items"][0].get("title", ""))
        news = findings.get("market_news")
        if news and news.get("items"):
            parts.append(news["items"][0].get("title", ""))
        body = " ".join(p for p in parts if p)
        return body or f"Limited public research available for {company.name}."

    def _call_llm(self, company: Company, findings: dict[str, Any], research_focus: str | None = None) -> str:
        user_prompt = (
            f"Company: {company.name} ({company.domain or 'no domain on file'})\n\n"
            f"Findings JSON:\n{json.dumps(findings, default=str)}"
        )
        provider = self.settings.AI_PROVIDER
        system_prompt = _SYNTHESIS_SYSTEM_PROMPT
        if research_focus:
            # Steers emphasis only — rule 1 above ("use ONLY facts present in
            # the findings JSON") still governs; this can't make the LLM
            # invent facts the findings don't contain, only prioritize which
            # of the actual findings to lead with.
            system_prompt += f"\n\nThe requesting team's research focus: {research_focus}"

        if provider == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=self.settings.AI_API_KEY, timeout=self.settings.AI_TIMEOUT_SECONDS)
            resp = client.chat.completions.create(
                model=self.settings.AI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=350,
            )
            return (resp.choices[0].message.content or "").strip()

        if provider == "anthropic":
            import anthropic

            client = anthropic.Anthropic(api_key=self.settings.AI_API_KEY)
            resp = client.messages.create(
                model=self.settings.ANTHROPIC_MODEL,
                max_tokens=350,
                temperature=0.3,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return (resp.content[0].text if resp.content else "").strip()

        raise ValueError(f"Unsupported AI_PROVIDER: {provider}")
