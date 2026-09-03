"""Tests for JiraSyncHandler (app.services.workflow_orchestrator.handlers)
— opportunity-stage sync into a per-org Jira project. See that class's
own docstring for the full behavior contract this exercises: mock mode
without a connection/project key, issue creation on ready_to_action
(and the created key persisted onto Opportunity.attributes), a comment
(never a transition) on won/lost, and no-op when there's no linked issue.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.fernet import Fernet
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.token_crypto import encrypt_token
from app.models.integration_connection import IntegrationConnection
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.workflow_task import WorkflowTaskStatus
from app.schemas.workflow import BeeEvent
from app.services.integrations import jira_sync
from app.services.workflow_orchestrator.handlers import JiraSyncHandler


@pytest.fixture(autouse=True)
def _token_encryption_key():
    from app.core import token_crypto

    original = app_settings.TOKEN_ENCRYPTION_KEY
    app_settings.TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
    token_crypto._fernet.cache_clear()
    yield
    app_settings.TOKEN_ENCRYPTION_KEY = original
    token_crypto._fernet.cache_clear()


def _make_org(session: Session, name: str = "Org") -> Organization:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _connect_jira(session: Session, org: Organization, *, project_key: str | None = "SALES") -> None:
    session.add(
        IntegrationConnection(
            organization_id=org.id,
            provider="jira",
            external_account_email="team.atlassian.net",
            access_token_encrypted=encrypt_token("a-token"),
            refresh_token_encrypted=encrypt_token("a-refresh"),
            token_expires_at=datetime.now(UTC) + timedelta(minutes=30),
            instance_url="cloud-xyz",
            config={"project_key": project_key} if project_key else {},
        )
    )
    session.commit()


def _make_opportunity(session: Session, org: Organization, **extra) -> Opportunity:
    opp = Opportunity(organization_id=org.id, title="Nimbus deal", strategy={}, **extra)
    session.add(opp)
    session.commit()
    session.refresh(opp)
    return opp


class TestJiraSyncHandlerMockMode:
    def test_no_organization_id_in_payload_is_mock(self, session: Session):
        opp_id = uuid.uuid4()
        event = BeeEvent(event_type="opportunity.ready_to_action", entity_id=opp_id, payload={})
        task = JiraSyncHandler().handle(event, session)
        assert task.mock is True
        assert task.status == WorkflowTaskStatus.MOCK_DISPATCHED

    def test_jira_not_connected_is_mock(self, session: Session):
        org = _make_org(session, "No Jira Org")
        opp = _make_opportunity(session, org)
        event = BeeEvent(
            event_type="opportunity.ready_to_action",
            entity_id=opp.id,
            payload={"organization_id": str(org.id), "company_name": "Nimbus"},
        )
        task = JiraSyncHandler().handle(event, session)
        assert task.mock is True

    def test_connected_but_no_project_key_is_mock(self, session: Session):
        org = _make_org(session, "No Project Key Org")
        _connect_jira(session, org, project_key=None)
        opp = _make_opportunity(session, org)
        event = BeeEvent(
            event_type="opportunity.ready_to_action",
            entity_id=opp.id,
            payload={"organization_id": str(org.id), "company_name": "Nimbus"},
        )
        task = JiraSyncHandler().handle(event, session)
        assert task.mock is True


class TestJiraSyncHandlerReadyToAction:
    def test_creates_an_issue_and_persists_the_key(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org = _make_org(session, "Real Jira Sync Org")
        _connect_jira(session, org)
        opp = _make_opportunity(session, org)

        monkeypatch.setattr(
            jira_sync.JiraApiClient, "create_issue", lambda self, **kw: "SALES-42"  # noqa: ARG005
        )

        event = BeeEvent(
            event_type="opportunity.ready_to_action",
            entity_id=opp.id,
            payload={"organization_id": str(org.id), "company_name": "Nimbus", "score": 88},
        )
        task = JiraSyncHandler().handle(event, session)

        assert task.mock is False
        assert task.status == WorkflowTaskStatus.COMPLETED
        assert task.result["issue_key"] == "SALES-42"

        session.expire_all()
        refreshed = session.get(Opportunity, opp.id)
        assert refreshed is not None
        assert refreshed.attributes.get("jira_issue_key") == "SALES-42"

    def test_jira_api_failure_marks_the_task_failed(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org = _make_org(session, "Jira Api Fails Org")
        _connect_jira(session, org)
        opp = _make_opportunity(session, org)

        def _boom(self, **kw):  # noqa: ARG001
            raise jira_sync.JiraApiError("Jira said no")

        monkeypatch.setattr(jira_sync.JiraApiClient, "create_issue", _boom)

        event = BeeEvent(
            event_type="opportunity.ready_to_action",
            entity_id=opp.id,
            payload={"organization_id": str(org.id), "company_name": "Nimbus"},
        )
        task = JiraSyncHandler().handle(event, session)
        assert task.status == WorkflowTaskStatus.FAILED
        assert task.mock is False


class TestJiraSyncHandlerOutcome:
    def test_comments_on_the_linked_issue_when_won(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        org = _make_org(session, "Won Comment Org")
        _connect_jira(session, org)
        opp = _make_opportunity(session, org, attributes={"jira_issue_key": "SALES-7"})

        calls = []
        monkeypatch.setattr(
            jira_sync.JiraApiClient,
            "add_comment",
            lambda self, **kw: calls.append(kw),  # noqa: ARG005
        )

        event = BeeEvent(
            event_type="opportunity.won",
            entity_id=opp.id,
            payload={"organization_id": str(org.id), "company_name": "Nimbus"},
        )
        task = JiraSyncHandler().handle(event, session)

        assert task.status == WorkflowTaskStatus.COMPLETED
        assert calls == [{"issue_key": "SALES-7", "text": calls[0]["text"]}]
        assert "GANADA" in calls[0]["text"]

    def test_no_linked_issue_is_a_mock_noop(self, session: Session):
        org = _make_org(session, "No Linked Issue Org")
        _connect_jira(session, org)
        opp = _make_opportunity(session, org)  # never went through ready_to_action

        event = BeeEvent(
            event_type="opportunity.lost",
            entity_id=opp.id,
            payload={"organization_id": str(org.id), "company_name": "Nimbus"},
        )
        task = JiraSyncHandler().handle(event, session)
        assert task.mock is True

    def test_never_attempts_a_workflow_transition(self, session: Session, monkeypatch: pytest.MonkeyPatch):
        """Only create_issue/add_comment exist on JiraApiClient — this just
        asserts the handler doesn't reach for anything else on won/lost."""
        org = _make_org(session, "No Transition Org")
        _connect_jira(session, org)
        opp = _make_opportunity(session, org, attributes={"jira_issue_key": "SALES-9"})
        assert not hasattr(jira_sync.JiraApiClient, "transition_issue")

        monkeypatch.setattr(jira_sync.JiraApiClient, "add_comment", lambda self, **kw: None)  # noqa: ARG005
        event = BeeEvent(
            event_type="opportunity.lost",
            entity_id=opp.id,
            payload={"organization_id": str(org.id), "loss_reason": "budget"},
        )
        task = JiraSyncHandler().handle(event, session)
        assert task.status == WorkflowTaskStatus.COMPLETED
