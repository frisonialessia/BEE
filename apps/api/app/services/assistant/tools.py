"""The copilot's tool belt — every read and write the model can perform.

Each tool is a thin, *org-scoped* wrapper over logic that already exists
behind an endpoint (the priority feed, the opportunity repository, the
dark-funnel hot-lead list, follow-up tasks). Nothing here queries a table
without going through :mod:`app.services.permissions` first: the model
only ever sees what the person typing would see in the dashboard, and a
mutation (create_task, dismiss_from_feed) applies exactly the same
tenant + assignment checks as the endpoint it mirrors.

Why tools instead of stuffing the pipeline into the prompt: a rep's
pipeline can be hundreds of rows, and the question is usually about three
of them. Letting the model *ask* for what it needs keeps the context
small, keeps the answer grounded in live data, and — because every tool
call is recorded on the reply — keeps the reasoning auditable ("I looked
at today's feed, then at this opportunity's brief").
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlmodel import Session, or_, select

from app.models.base import ActionStatus, OpportunityStatus, SignalType
from app.models.opportunity import Opportunity
from app.models.opportunity_task import OpportunityTask
from app.models.pending_action import PendingAction
from app.models.signal import Signal
from app.models.user import User
from app.repositories.opportunity import OpportunityRepository
from app.services.dark_funnel.service import DarkFunnelService
from app.services.permissions import get_visible_user_ids, scope_by_organization_id
from app.services.priority_feed import build_today_feed

# Same "come back to this later" window as POST /priority/today/{id}/dismiss.
_DISMISS_DAYS = 7
_MAX_ROWS = 20


@dataclass(slots=True)
class ToolResult:
    """What a tool hands back: ``data`` goes to the model verbatim (as JSON),
    ``summary`` is the one-line trace shown to the person in the UI."""

    data: dict[str, Any]
    summary: str


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[dict[str, Any]], ToolResult]
    # Surfaced to the UI so it can label the trace ("consultó" vs "creó").
    mutates: bool = False


@dataclass(slots=True)
class ToolContext:
    session: Session
    user: User
    visible_user_ids: set[uuid.UUID] | None = field(default=None)

    def __post_init__(self) -> None:
        self.visible_user_ids = get_visible_user_ids(self.session, self.user)

    # ── Shared guards ──────────────────────────────────────────────────────

    def visible_opportunity(self, raw_id: str) -> Opportunity | None:
        """Tenant boundary first, then the manager-hierarchy assignment
        rule — the same two checks ``opportunities._hidden_from`` applies.
        An id from another organization is indistinguishable from a
        nonexistent one (``None``), never a hint that it exists."""
        try:
            opp_id = uuid.UUID(str(raw_id))
        except ValueError:
            return None
        opp = self.session.get(Opportunity, opp_id)
        if opp is None:
            return None
        if opp.organization_id is not None and opp.organization_id != self.user.organization_id:
            return None
        if (
            self.visible_user_ids is not None
            and opp.assigned_to_user_id is not None
            and opp.assigned_to_user_id not in self.visible_user_ids
        ):
            return None
        return opp


def _opportunity_row(opp: Opportunity) -> dict[str, Any]:
    strategy = opp.strategy or {}
    return {
        "id": str(opp.id),
        "title": opp.title,
        "company": opp.company.name if opp.company else None,
        "status": opp.status.value if hasattr(opp.status, "value") else str(opp.status),
        "score": opp.score,
        "amount": opp.amount,
        "expected_close_date": opp.expected_close_date.isoformat() if opp.expected_close_date else None,
        "hot_lead": bool(strategy.get("hot_lead", False)),
        "assigned_to_user_id": str(opp.assigned_to_user_id) if opp.assigned_to_user_id else None,
        "created_at": opp.created_at.isoformat(),
    }


def build_tools(ctx: ToolContext) -> list[ToolSpec]:
    """Return the full tool belt bound to one caller's visibility."""

    session = ctx.session
    user = ctx.user
    org_id = user.organization_id

    # ── Reads ──────────────────────────────────────────────────────────────

    def list_today_priorities(_: dict[str, Any]) -> ToolResult:
        feed = build_today_feed(
            session,
            organization_id=org_id,
            visible_user_ids=ctx.visible_user_ids,
            team_id=user.team_id,
        )
        cards = [
            {
                "id": c.id,
                "kind": c.kind,
                "company": c.company_name,
                "headline": c.headline,
                "reasoning": c.reasoning,
                "urgency": c.urgency,
                "recommended_action": c.recommended_action,
                "opportunity_id": str(c.opportunity_id) if c.opportunity_id else None,
                "has_pending_approval": c.pending_action_id is not None,
            }
            for c in feed.cards
        ]
        return ToolResult({"cards": cards, "generated_at": feed.generated_at}, f"{len(cards)} cards")

    def search_opportunities(args: dict[str, Any]) -> ToolResult:
        query = (args.get("query") or "").strip().lower()
        status = args.get("status")
        if status is not None and status not in OpportunityStatus.__members__.values():
            return ToolResult({"error": f"unknown status {status!r}"}, "invalid status")
        limit = max(1, min(int(args.get("limit") or _MAX_ROWS), _MAX_ROWS))
        rows = OpportunityRepository(session).list_scoped(
            status=status,
            limit=200,
            visible_user_ids=ctx.visible_user_ids,
            organization_id=org_id,
        )
        if query:
            rows = [
                o
                for o in rows
                if query in o.title.lower() or (o.company is not None and query in o.company.name.lower())
            ]
        rows = rows[:limit]
        return ToolResult({"opportunities": [_opportunity_row(o) for o in rows]}, f"{len(rows)} results")

    def get_opportunity_brief(args: dict[str, Any]) -> ToolResult:
        opp = ctx.visible_opportunity(args.get("opportunity_id", ""))
        if opp is None:
            return ToolResult({"error": "not_found"}, "not found")
        strategy = opp.strategy or {}
        company = opp.company
        lead = opp.lead
        pending = session.exec(
            select(PendingAction).where(
                PendingAction.opportunity_id == opp.id,
                PendingAction.status == ActionStatus.PENDING_APPROVAL,
            )
        ).all()
        tasks = session.exec(
            select(OpportunityTask).where(
                OpportunityTask.opportunity_id == opp.id,
                OpportunityTask.completed_at.is_(None),  # type: ignore[union-attr]
            )
        ).all()
        recent_signals: list[dict[str, Any]] = []
        if company is not None:
            stmt = (
                select(Signal)
                .where(Signal.company_id == company.id)
                .order_by(Signal.detected_at.desc())  # type: ignore[attr-defined]
                .limit(5)
            )
            stmt = scope_by_organization_id(stmt, Signal.organization_id, org_id)  # type: ignore[arg-type]
            recent_signals = [
                {"type": s.signal_type.value, "title": s.title, "detected_at": s.detected_at.isoformat()}
                for s in session.exec(stmt).all()
            ]
        data = {
            **_opportunity_row(opp),
            "company_profile": {
                "name": company.name,
                "domain": company.domain,
                "industry": company.industry,
                "size": company.size,
                "country": company.country,
            }
            if company
            else None,
            "lead": {"name": lead.full_name, "title": lead.title, "seniority": lead.seniority} if lead else None,
            "strategy": {
                key: strategy.get(key)
                for key in ("playbook", "channel", "pain_point", "closing_argument", "timing_window", "confidence_score")
            },
            "pending_approvals": [
                {"id": str(p.id), "type": p.action_type.value, "title": p.title, "preview": p.preview} for p in pending
            ],
            "open_tasks": [
                {"id": str(t.id), "title": t.title, "due_at": t.due_at.isoformat() if t.due_at else None} for t in tasks
            ],
            "recent_signals": recent_signals,
            "qualification": opp.qualification or {},
        }
        return ToolResult(data, opp.title)

    def list_signals(args: dict[str, Any]) -> ToolResult:
        limit = max(1, min(int(args.get("limit") or 10), _MAX_ROWS))
        signal_type = args.get("signal_type")
        stmt = select(Signal).order_by(Signal.detected_at.desc())  # type: ignore[attr-defined]
        stmt = scope_by_organization_id(stmt, Signal.organization_id, org_id)  # type: ignore[arg-type]
        if signal_type:
            if signal_type not in SignalType.__members__.values():
                return ToolResult({"error": f"unknown signal_type {signal_type!r}"}, "invalid type")
            stmt = stmt.where(Signal.signal_type == SignalType(signal_type))
        rows = session.exec(stmt.limit(limit)).all()
        signals = [
            {
                "id": str(s.id),
                "type": s.signal_type.value,
                "title": s.title,
                "company": s.company.name if s.company else None,
                "score": s.score,
                "detected_at": s.detected_at.isoformat(),
            }
            for s in rows
        ]
        return ToolResult({"signals": signals}, f"{len(signals)} signals")

    def list_hot_accounts(args: dict[str, Any]) -> ToolResult:
        limit = max(1, min(int(args.get("limit") or 10), _MAX_ROWS))
        leads = DarkFunnelService(session).get_hot_leads(limit=limit, hot_only=True, organization_id=org_id)
        accounts = [
            {
                "company": h.company_name or h.company_domain,
                "domain": h.company_domain,
                "intent_score": round(h.research_intensity_score),
                "buying_stage": h.buying_stage,
                "signal_count": h.signal_count,
            }
            for h in leads
        ]
        return ToolResult({"accounts": accounts}, f"{len(accounts)} hot accounts")

    def list_tasks(args: dict[str, Any]) -> ToolResult:
        stmt = select(OpportunityTask).where(OpportunityTask.completed_at.is_(None))  # type: ignore[union-attr]
        stmt = scope_by_organization_id(stmt, OpportunityTask.organization_id, org_id)  # type: ignore[arg-type]
        if ctx.visible_user_ids is not None:
            stmt = stmt.where(
                or_(
                    OpportunityTask.assigned_to_user_id.in_(ctx.visible_user_ids),  # type: ignore[union-attr]
                    OpportunityTask.assigned_to_user_id.is_(None),  # type: ignore[union-attr]
                )
            )
        if args.get("overdue_only"):
            stmt = stmt.where(
                OpportunityTask.due_at.is_not(None),  # type: ignore[union-attr]
                OpportunityTask.due_at < datetime.now(UTC),  # type: ignore[operator]
            )
        rows = session.exec(stmt.order_by(OpportunityTask.due_at.asc().nulls_last()).limit(_MAX_ROWS)).all()  # type: ignore[union-attr]
        tasks = [
            {
                "id": str(t.id),
                "title": t.title,
                "opportunity_id": str(t.opportunity_id),
                "due_at": t.due_at.isoformat() if t.due_at else None,
            }
            for t in rows
        ]
        return ToolResult({"tasks": tasks}, f"{len(tasks)} open tasks")

    # ── Writes ─────────────────────────────────────────────────────────────

    def create_task(args: dict[str, Any]) -> ToolResult:
        opp = ctx.visible_opportunity(args.get("opportunity_id", ""))
        if opp is None:
            return ToolResult({"error": "not_found"}, "not found")
        title = (args.get("title") or "").strip()[:300]
        if not title:
            return ToolResult({"error": "title_required"}, "title required")
        due_at = None
        due_in_days = args.get("due_in_days")
        if due_in_days is not None:
            due_at = datetime.now(UTC) + timedelta(days=max(0, int(due_in_days)))
        task = OpportunityTask(
            organization_id=user.organization_id,
            opportunity_id=opp.id,
            assigned_to_user_id=opp.assigned_to_user_id or user.id,
            created_by_user_id=user.id,
            title=title,
            due_at=due_at,
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        return ToolResult(
            {"created": True, "task": {"id": str(task.id), "title": task.title, "due_at": due_at.isoformat() if due_at else None}},
            title,
        )

    def dismiss_from_feed(args: dict[str, Any]) -> ToolResult:
        opp = ctx.visible_opportunity(args.get("opportunity_id", ""))
        if opp is None:
            return ToolResult({"error": "not_found"}, "not found")
        attributes = dict(opp.attributes or {})
        attributes["dismissed_until"] = (datetime.now(UTC) + timedelta(days=_DISMISS_DAYS)).isoformat()
        opp.attributes = attributes
        session.add(opp)
        session.commit()
        return ToolResult({"dismissed": True, "until": attributes["dismissed_until"]}, opp.title)

    return [
        ToolSpec(
            name="list_today_priorities",
            description=(
                "Today's ranked decision feed (La jugada de hoy): the highest-leverage opportunities "
                "and open anomaly alerts, each with the reason it ranks. Call this first for any "
                "'what should I do today / what's urgent' question."
            ),
            input_schema={"type": "object", "properties": {}, "additionalProperties": False},
            handler=list_today_priorities,
        ),
        ToolSpec(
            name="search_opportunities",
            description="Search the caller's visible pipeline by free text (title or company) and/or status.",
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Substring matched against title and company name."},
                    "status": {
                        "type": "string",
                        "enum": [s.value for s in OpportunityStatus],
                        "description": "Restrict to one pipeline stage.",
                    },
                    "limit": {"type": "integer", "minimum": 1, "maximum": _MAX_ROWS},
                },
                "additionalProperties": False,
            },
            handler=search_opportunities,
        ),
        ToolSpec(
            name="get_opportunity_brief",
            description=(
                "Everything known about one opportunity: company profile, lead, generated strategy "
                "(playbook, channel, pain point, closing argument), pending approvals, open tasks and "
                "the company's latest signals. Use before drafting outreach or advising on a deal."
            ),
            input_schema={
                "type": "object",
                "properties": {"opportunity_id": {"type": "string"}},
                "required": ["opportunity_id"],
                "additionalProperties": False,
            },
            handler=get_opportunity_brief,
        ),
        ToolSpec(
            name="list_signals",
            description="Most recent market signals visible to the organization, optionally filtered by type.",
            input_schema={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "minimum": 1, "maximum": _MAX_ROWS},
                    "signal_type": {"type": "string", "enum": [s.value for s in SignalType]},
                },
                "additionalProperties": False,
            },
            handler=list_signals,
        ),
        ToolSpec(
            name="list_hot_accounts",
            description="Accounts currently in active research mode (dark-funnel intent score), highest intent first.",
            input_schema={
                "type": "object",
                "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": _MAX_ROWS}},
                "additionalProperties": False,
            },
            handler=list_hot_accounts,
        ),
        ToolSpec(
            name="list_tasks",
            description="Open follow-up tasks visible to the caller, soonest due first.",
            input_schema={
                "type": "object",
                "properties": {"overdue_only": {"type": "boolean"}},
                "additionalProperties": False,
            },
            handler=list_tasks,
        ),
        ToolSpec(
            name="create_task",
            description=(
                "Create a follow-up task on an opportunity. Only call when the person explicitly asks "
                "to remember / schedule / create a task; confirm what was created in the reply."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "opportunity_id": {"type": "string"},
                    "title": {"type": "string", "maxLength": 300},
                    "due_in_days": {"type": "integer", "minimum": 0, "maximum": 365},
                },
                "required": ["opportunity_id", "title"],
                "additionalProperties": False,
            },
            handler=create_task,
            mutates=True,
        ),
        ToolSpec(
            name="dismiss_from_feed",
            description=(
                "Hide an opportunity from today's decision feed for a week. Only when the person "
                "explicitly asks to dismiss / snooze / skip it."
            ),
            input_schema={
                "type": "object",
                "properties": {"opportunity_id": {"type": "string"}},
                "required": ["opportunity_id"],
                "additionalProperties": False,
            },
            handler=dismiss_from_feed,
            mutates=True,
        ),
    ]
