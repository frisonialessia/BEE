"""Tests for real-time notifications — app.services.realtime (publish
side), RealtimeNotificationHandler (app.services.workflow_orchestrator.
handlers), the meeting.completed listener
(app.services.events.listeners), and the SSE endpoint's auth/wiring
(GET /notifications/stream). Uses fakeredis, same "hermetic, no external
services" approach as test_redis_shared_state.py.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core import redis as bee_redis
from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.meeting import Meeting
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.user import User
from app.schemas.workflow import BeeEvent
from app.services.realtime import notification_channel, publish_notification
from app.services.workflow_orchestrator.handlers import RealtimeNotificationHandler


@pytest.fixture
def fake_client():
    """A fresh fakeredis instance per test, monkeypatched in as
    app.core.redis.get_redis_client's return value — mirrors
    test_redis_shared_state.py's own fixture."""
    client = fakeredis.FakeStrictRedis(decode_responses=True)
    yield client
    client.flushall()


def _make_org_and_owner(session: Session, name: str) -> tuple[Organization, User]:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"{name.lower()}@x.io",
        hashed_password=hash_password("password123"),
        full_name="Owner",
        role=UserRole.OWNER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return org, user


def _auth_headers(user: User) -> dict:
    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestPublishNotification:
    def test_noop_when_redis_not_configured(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(bee_redis, "get_redis_client", lambda: None)
        # Must not raise.
        publish_notification(uuid.uuid4(), event_type="opportunity.won", payload={})

    def test_publishes_json_to_the_orgs_channel(self, monkeypatch: pytest.MonkeyPatch, fake_client):
        monkeypatch.setattr("app.services.realtime.service.get_redis_client", lambda: fake_client)
        org_id = uuid.uuid4()
        pubsub = fake_client.pubsub()
        pubsub.subscribe(notification_channel(org_id))
        pubsub.get_message(timeout=1)  # consume the subscribe-confirmation message

        publish_notification(org_id, event_type="opportunity.won", payload={"opportunity_id": "abc"})

        message = pubsub.get_message(timeout=1)
        assert message is not None
        data = json.loads(message["data"])
        assert data == {"event_type": "opportunity.won", "opportunity_id": "abc"}

    def test_does_not_raise_when_redis_command_fails(self, monkeypatch: pytest.MonkeyPatch):
        class _Boom:
            def publish(self, *_a, **_kw):
                raise ConnectionError("redis is down")

        monkeypatch.setattr("app.services.realtime.service.get_redis_client", lambda: _Boom())
        publish_notification(uuid.uuid4(), event_type="opportunity.won", payload={})


class TestRealtimeNotificationHandler:
    def test_no_organization_id_is_mock(self, session: Session):
        event = BeeEvent(event_type="opportunity.won", entity_id=uuid.uuid4(), payload={})
        task = RealtimeNotificationHandler().handle(event, session)
        assert task.mock is True

    def test_redis_not_configured_is_mock(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(bee_redis, "get_redis_client", lambda: None)
        event = BeeEvent(
            event_type="opportunity.ready_to_action",
            entity_id=uuid.uuid4(),
            payload={"organization_id": str(uuid.uuid4()), "company_name": "Nimbus"},
        )
        task = RealtimeNotificationHandler().handle(event, session)
        assert task.mock is True

    def test_publishes_when_redis_is_configured(
        self, session: Session, monkeypatch: pytest.MonkeyPatch, fake_client
    ):
        # Two patch sites: the handler's own lazy `from app.core.redis
        # import get_redis_client` (re-resolved from app.core.redis each
        # call, so patching the module attribute is enough) AND
        # app.services.realtime.service's module-level import of the same
        # name (bound once at import time — patching app.core.redis alone
        # doesn't reach it, "patch where it's used" applies here too).
        monkeypatch.setattr(bee_redis, "get_redis_client", lambda: fake_client)
        monkeypatch.setattr("app.services.realtime.service.get_redis_client", lambda: fake_client)
        org_id = uuid.uuid4()
        pubsub = fake_client.pubsub()
        pubsub.subscribe(notification_channel(org_id))
        pubsub.get_message(timeout=1)

        event = BeeEvent(
            event_type="opportunity.won",
            entity_id=uuid.uuid4(),
            payload={"organization_id": str(org_id), "company_name": "Nimbus", "score": 91},
        )
        task = RealtimeNotificationHandler().handle(event, session)
        assert task.mock is False
        assert task.status.value == "completed" if hasattr(task.status, "value") else task.status == "completed"

        message = pubsub.get_message(timeout=1)
        assert message is not None
        data = json.loads(message["data"])
        assert data["event_type"] == "opportunity.won"
        assert data["company_name"] == "Nimbus"


class TestMeetingCompletedNotifyListener:
    def test_completing_a_meeting_publishes_a_notification(
        self, client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
    ):
        calls: list = []
        monkeypatch.setattr(
            "app.services.events.listeners.publish_notification", lambda *a, **kw: calls.append((a, kw))
        )

        org, owner = _make_org_and_owner(session, "MeetingNotifyCo")
        opp = Opportunity(organization_id=org.id, title="Deal", strategy={})
        session.add(opp)
        session.commit()
        session.refresh(opp)

        meeting = Meeting(
            organization_id=org.id,
            created_by_user_id=owner.id,
            opportunity_id=opp.id,
            title="Discovery call",
            starts_at=datetime.now(UTC) - timedelta(hours=1),
        )
        session.add(meeting)
        session.commit()
        session.refresh(meeting)

        complete_resp = client.post(f"/api/v1/meetings/{meeting.id}/complete", headers=_auth_headers(owner))
        assert complete_resp.status_code == 200, complete_resp.text
        assert len(calls) == 1
        _, kwargs = calls[0]
        assert kwargs["event_type"] == "meeting.completed"


class TestNotificationsStreamAuth:
    def test_no_token_is_401(self, client: TestClient):
        resp = client.get("/api/v1/notifications/stream")
        assert resp.status_code == 401

    def test_query_param_token_authenticates(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "SSE Auth Co",
                "full_name": "Owner",
                "email": "owner@sseauth.co",
                "password": "password123",
            },
        )
        token = resp.json()["access_token"]

        # No Redis configured in tests → the stream sends one "unavailable"
        # event and ends immediately, so this doesn't hang.
        with client.stream("GET", f"/api/v1/notifications/stream?token={token}") as stream_resp:
            assert stream_resp.status_code == 200
            body = "".join(stream_resp.iter_text())
        assert "event: unavailable" in body
