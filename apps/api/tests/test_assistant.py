"""BEE Copilot — ``/api/v1/assistant``.

Hermetic: the model is a scripted backend injected through
``build_backend`` (no network, no key), so what these tests pin down is
the part that matters for a multi-tenant product — that every tool the
model can call sees exactly what the caller sees, and nothing more.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import OpportunityStatus, UserRole
from app.models.opportunity import Opportunity
from app.models.opportunity_task import OpportunityTask
from app.models.organization import Organization
from app.models.user import User
from app.services.assistant import AssistantService
from app.services.assistant import service as assistant_service
from app.services.assistant.tools import ToolSpec
from tests.conftest import _create_full_opportunity


def _make_user(session: Session, *, role: UserRole = UserRole.OWNER, org: Organization | None = None) -> tuple[Organization, User]:
    if org is None:
        org = Organization(name="Copilot Org", slug=f"copilot-{uuid.uuid4().hex[:8]}")
        session.add(org)
        session.commit()
        session.refresh(org)
    user = User(
        organization_id=org.id,
        email=f"{role.value}-{uuid.uuid4().hex[:8]}@bee.ai",
        hashed_password=hash_password("password123"),
        full_name="Copilot User",
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return org, user


def _headers(org: Organization, user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, organization_id=org.id, role=user.role.value)}"}


def _own_opportunity(session: Session, org: Organization, user: User | None = None) -> Opportunity:
    _, _, _, opp = _create_full_opportunity(session)
    opp.organization_id = org.id
    opp.status = OpportunityStatus.PRIORITIZED
    if user is not None:
        opp.assigned_to_user_id = user.id
    session.add(opp)
    session.commit()
    session.refresh(opp)
    return opp


class ScriptedBackend:
    """Calls the tools it was told to, then answers with a fixed sentence.
    Records the system prompt so tests can assert on locale wiring."""

    provider = "scripted"
    model = "scripted-1"

    def __init__(self, script: list[tuple[str, dict[str, Any]]], reply: str = "ok") -> None:
        self.script = script
        self.reply = reply
        self.system: str | None = None
        self.results: list[dict[str, Any]] = []

    def run(self, *, system: str, history: list[dict[str, str]], tools: list[ToolSpec], execute) -> str:  # noqa: ANN001, ARG002
        self.system = system
        assert history[-1]["role"] == "user"
        for name, args in self.script:
            self.results.append(execute(name, args))
        return self.reply


@pytest.fixture
def scripted(monkeypatch: pytest.MonkeyPatch):
    """Install a scripted backend as the configured provider for one test."""

    def _install(script: list[tuple[str, dict[str, Any]]], reply: str = "ok") -> ScriptedBackend:
        backend = ScriptedBackend(script, reply)
        monkeypatch.setattr(assistant_service, "build_backend", lambda: backend)
        return backend

    return _install


# ── Availability ─────────────────────────────────────────────────────────────


class TestAvailability:
    def test_status_reports_unavailable_without_a_provider(self, client: TestClient, session: Session, monkeypatch):
        monkeypatch.setattr(assistant_service, "build_backend", lambda: None)
        org, user = _make_user(session)
        resp = client.get("/api/v1/assistant/status", headers=_headers(org, user))
        assert resp.status_code == 200
        body = resp.json()
        assert body["available"] is False
        assert body["provider"] == "none"
        # The tool belt is still listed — the UI shows what the copilot *could* do.
        assert {t["name"] for t in body["tools"]} >= {"list_today_priorities", "create_task"}

    def test_chat_is_503_without_a_provider_so_the_client_falls_back(self, client: TestClient, session: Session, monkeypatch):
        monkeypatch.setattr(assistant_service, "build_backend", lambda: None)
        org, user = _make_user(session)
        resp = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={"messages": [{"role": "user", "content": "¿Qué hago hoy?"}]},
        )
        assert resp.status_code == 503

    def test_requires_a_logged_in_user(self, client: TestClient):
        assert client.get("/api/v1/assistant/status").status_code == 401
        assert client.post("/api/v1/assistant/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401

    def test_build_backend_honours_provider_settings(self, monkeypatch):
        from app.core.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "AI_PROVIDER", "anthropic")
        monkeypatch.setattr(settings, "AI_API_KEY", None)
        assert assistant_service.build_backend() is None
        monkeypatch.setattr(settings, "AI_API_KEY", "sk-test")
        backend = assistant_service.build_backend()
        assert backend is not None and backend.provider == "anthropic"
        assert backend.model == settings.ANTHROPIC_MODEL


# ── The loop end to end ──────────────────────────────────────────────────────


class TestChat:
    def test_reply_carries_the_tool_trace(self, client: TestClient, session: Session, scripted):
        org, user = _make_user(session)
        opp = _own_opportunity(session, org)
        backend = scripted(
            [("list_today_priorities", {}), ("search_opportunities", {"query": "test"})],
            reply="Hoy: Test Corp.",
        )
        resp = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={"messages": [{"role": "user", "content": "¿Qué hago hoy?"}], "locale": "en"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["reply"] == "Hoy: Test Corp."
        assert body["provider"] == "scripted"
        assert [c["name"] for c in body["tool_calls"]] == ["list_today_priorities", "search_opportunities"]
        assert all(c["mutates"] is False for c in body["tool_calls"])
        # The feed the model saw is the same one GET /priority/today returns.
        assert any(c["opportunity_id"] == str(opp.id) for c in backend.results[0]["cards"])
        assert backend.results[1]["opportunities"][0]["id"] == str(opp.id)
        assert backend.system is not None and "English" in backend.system

    def test_unknown_tool_is_reported_to_the_model_not_raised(self, client: TestClient, session: Session, scripted):
        org, user = _make_user(session)
        backend = scripted([("delete_everything", {})])
        resp = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={"messages": [{"role": "user", "content": "hola"}]},
        )
        assert resp.status_code == 200
        assert "error" in backend.results[0]


# ── Tenant + visibility scoping of every tool ────────────────────────────────


class TestScoping:
    def test_brief_and_writes_refuse_another_organizations_opportunity(self, session: Session):
        org_a, user_a = _make_user(session)
        org_b, _ = _make_user(session)
        foreign = _own_opportunity(session, org_b)

        service = AssistantService(session, user_a, backend=ScriptedBackend([]))
        assert service.execute_tool("get_opportunity_brief", {"opportunity_id": str(foreign.id)}).data == {"error": "not_found"}
        assert service.execute_tool("create_task", {"opportunity_id": str(foreign.id), "title": "x"}).data == {"error": "not_found"}
        assert service.execute_tool("dismiss_from_feed", {"opportunity_id": str(foreign.id)}).data == {"error": "not_found"}
        assert session.query(OpportunityTask).count() == 0
        session.refresh(foreign)
        assert "dismissed_until" not in (foreign.attributes or {})

    def test_search_hides_other_tenants_and_other_reps_from_a_member(self, session: Session):
        org, owner = _make_user(session)
        _, member = _make_user(session, role=UserRole.MEMBER, org=org)
        org_b, _ = _make_user(session)
        mine = _own_opportunity(session, org, member)
        theirs = _own_opportunity(session, org, owner)
        foreign = _own_opportunity(session, org_b)

        as_member = AssistantService(session, member, backend=ScriptedBackend([]))
        ids = {o["id"] for o in as_member.execute_tool("search_opportunities", {}).data["opportunities"]}
        assert ids == {str(mine.id)}
        assert as_member.execute_tool("get_opportunity_brief", {"opportunity_id": str(theirs.id)}).data == {"error": "not_found"}

        as_owner = AssistantService(session, owner, backend=ScriptedBackend([]))
        ids = {o["id"] for o in as_owner.execute_tool("search_opportunities", {}).data["opportunities"]}
        assert ids == {str(mine.id), str(theirs.id)}
        assert str(foreign.id) not in ids

    def test_create_task_and_dismiss_apply_to_own_opportunity(self, session: Session):
        org, user = _make_user(session)
        opp = _own_opportunity(session, org, user)
        service = AssistantService(session, user, backend=ScriptedBackend([]))

        created = service.execute_tool(
            "create_task", {"opportunity_id": str(opp.id), "title": "Llamar el lunes", "due_in_days": 3}
        )
        assert created.data["created"] is True
        task = session.get(OpportunityTask, uuid.UUID(created.data["task"]["id"]))
        assert task is not None and task.organization_id == org.id and task.assigned_to_user_id == user.id

        listed = service.execute_tool("list_tasks", {}).data["tasks"]
        assert [t["title"] for t in listed] == ["Llamar el lunes"]

        dismissed = service.execute_tool("dismiss_from_feed", {"opportunity_id": str(opp.id)})
        assert dismissed.data["dismissed"] is True
        feed = service.execute_tool("list_today_priorities", {}).data["cards"]
        assert not any(c["opportunity_id"] == str(opp.id) for c in feed)

    def test_brief_includes_strategy_and_company_signals(self, session: Session):
        org, user = _make_user(session)
        opp = _own_opportunity(session, org, user)
        service = AssistantService(session, user, backend=ScriptedBackend([]))
        brief = service.execute_tool("get_opportunity_brief", {"opportunity_id": str(opp.id)}).data
        assert brief["strategy"]["playbook"] == "post_funding_outreach"
        assert brief["company_profile"]["name"] == "Test Corp"
        assert brief["lead"]["title"] == "VP Sales"
        assert brief["recent_signals"][0]["type"] == "funding_round"

    def test_signals_are_scoped_to_the_organization(self, session: Session):
        org, user = _make_user(session)
        org_b, _ = _make_user(session)
        _, _, sig_b, _ = _create_full_opportunity(session)
        sig_b.organization_id = org_b.id
        session.add(sig_b)
        session.commit()

        service = AssistantService(session, user, backend=ScriptedBackend([]))
        ids = {s["id"] for s in service.execute_tool("list_signals", {"limit": 20}).data["signals"]}
        assert str(sig_b.id) not in ids
        assert service.execute_tool("list_signals", {"signal_type": "bogus"}).data["error"].startswith("unknown")


# ── Saved conversation history ───────────────────────────────────────────────


class TestConversations:
    def test_chat_without_a_conversation_id_creates_one_titled_from_the_first_message(
        self, client: TestClient, session: Session, scripted
    ):
        scripted([], reply="Hola, ¿en qué te ayudo?")
        org, user = _make_user(session)
        resp = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={"messages": [{"role": "user", "content": "¿Qué hago hoy?"}]},
        )
        assert resp.status_code == 200, resp.text
        conversation_id = resp.json()["conversation_id"]
        assert conversation_id

        listing = client.get("/api/v1/assistant/conversations", headers=_headers(org, user))
        assert listing.status_code == 200
        rows = listing.json()
        assert len(rows) == 1
        assert rows[0]["id"] == conversation_id
        assert rows[0]["title"] == "¿Qué hago hoy?"

        detail = client.get(f"/api/v1/assistant/conversations/{conversation_id}", headers=_headers(org, user))
        assert detail.status_code == 200
        messages = detail.json()["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant"]
        assert messages[1]["content"] == "Hola, ¿en qué te ayudo?"

    def test_a_second_turn_appends_onto_the_same_conversation(self, client: TestClient, session: Session, scripted):
        scripted([], reply="Primera respuesta")
        org, user = _make_user(session)
        first = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={"messages": [{"role": "user", "content": "Hola"}]},
        )
        conversation_id = first.json()["conversation_id"]

        scripted([], reply="Segunda respuesta")
        second = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={
                "messages": [
                    {"role": "user", "content": "Hola"},
                    {"role": "assistant", "content": "Primera respuesta"},
                    {"role": "user", "content": "¿Y ahora?"},
                ],
                "conversation_id": conversation_id,
            },
        )
        assert second.status_code == 200, second.text
        assert second.json()["conversation_id"] == conversation_id

        detail = client.get(f"/api/v1/assistant/conversations/{conversation_id}", headers=_headers(org, user))
        contents = [m["content"] for m in detail.json()["messages"]]
        assert contents == ["Hola", "Primera respuesta", "¿Y ahora?", "Segunda respuesta"]
        # Listing still shows exactly one thread, not a second one per turn.
        rows = client.get("/api/v1/assistant/conversations", headers=_headers(org, user)).json()
        assert len(rows) == 1

    def test_a_conversation_is_private_to_the_user_who_started_it(self, client: TestClient, session: Session, scripted):
        scripted([], reply="ok")
        org, user_a = _make_user(session)
        _, user_b = _make_user(session, org=org)
        started = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user_a),
            json={"messages": [{"role": "user", "content": "secreto"}]},
        )
        conversation_id = started.json()["conversation_id"]

        assert client.get("/api/v1/assistant/conversations", headers=_headers(org, user_b)).json() == []
        assert (
            client.get(f"/api/v1/assistant/conversations/{conversation_id}", headers=_headers(org, user_b)).status_code
            == 404
        )
        assert (
            client.delete(f"/api/v1/assistant/conversations/{conversation_id}", headers=_headers(org, user_b)).status_code
            == 404
        )

    def test_deleting_a_conversation_removes_it_from_the_list(self, client: TestClient, session: Session, scripted):
        scripted([], reply="ok")
        org, user = _make_user(session)
        started = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={"messages": [{"role": "user", "content": "hola"}]},
        )
        conversation_id = started.json()["conversation_id"]

        resp = client.delete(f"/api/v1/assistant/conversations/{conversation_id}", headers=_headers(org, user))
        assert resp.status_code == 204
        assert client.get("/api/v1/assistant/conversations", headers=_headers(org, user)).json() == []
        assert (
            client.get(f"/api/v1/assistant/conversations/{conversation_id}", headers=_headers(org, user)).status_code
            == 404
        )

    def test_conversations_endpoints_require_a_logged_in_user(self, client: TestClient):
        assert client.get("/api/v1/assistant/conversations").status_code == 401
        assert client.get(f"/api/v1/assistant/conversations/{uuid.uuid4()}").status_code == 401
        assert client.delete(f"/api/v1/assistant/conversations/{uuid.uuid4()}").status_code == 401

    def test_stale_conversations_are_swept_on_list(self, client: TestClient, session: Session, scripted):
        from datetime import timedelta

        from app.models.assistant_conversation import RETENTION_DAYS, AssistantConversation
        from app.models.base import utcnow

        scripted([], reply="ok")
        org, user = _make_user(session)
        fresh = client.post(
            "/api/v1/assistant/chat",
            headers=_headers(org, user),
            json={"messages": [{"role": "user", "content": "hola"}]},
        )
        fresh_id = fresh.json()["conversation_id"]

        stale = AssistantConversation(
            organization_id=org.id,
            user_id=user.id,
            title="Viejo",
            messages=[{"role": "user", "content": "viejo", "created_at": utcnow().isoformat()}],
            last_message_at=utcnow() - timedelta(days=RETENTION_DAYS + 1),
        )
        session.add(stale)
        session.commit()
        session.refresh(stale)
        stale_id = stale.id

        rows = client.get("/api/v1/assistant/conversations", headers=_headers(org, user)).json()
        assert {r["id"] for r in rows} == {fresh_id}
        session.expire_all()  # the sweep deleted it through the request's own session
        assert session.get(AssistantConversation, stale_id) is None
