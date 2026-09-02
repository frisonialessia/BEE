"""Tests for the fine-tuning dataset export —
app.services.ml_training.export_strategy_outcomes_jsonl and
GET /organizations/ml-training/export.jsonl.
"""

from __future__ import annotations

import json
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.strategy_outcome import StrategyOutcome
from app.models.user import User
from app.services.ml_training import export_strategy_outcomes_jsonl
from app.services.ml_training.export import _build_training_completion


def _make_org(session: Session) -> Organization:
    org = Organization(name="Acme Corp", slug=f"acme-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_outcome(
    session: Session,
    *,
    organization_id: uuid.UUID | None = None,
    outcome: str = "won",
    signal_type: str = "funding_round",
    industry: str | None = "saas",
    seniority: str | None = "vp",
    snapshot: dict | None = None,
) -> StrategyOutcome:
    row = StrategyOutcome(
        organization_id=organization_id,
        opportunity_id=uuid.uuid4(),
        outcome=outcome,
        signal_type=signal_type,
        company_industry=industry,
        lead_seniority=seniority,
        playbook="challenger",
        channel="email",
        generator="rule_based",
        generator_version="1",
        strategy_snapshot=snapshot
        if snapshot is not None
        else {
            "pain_point": "Scaling sales ops after the raise",
            "closing_argument": "Congrats on the round — let's talk capacity.",
            "timing_window": {"urgency": "immediate", "reason": "post-raise window", "expires_at": None},
            "playbook": "challenger",
            "next_best_action": "reach_out",
            "channel": "email",
        },
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _auth_headers(session: Session, org: Organization, role: UserRole) -> dict:
    user = User(
        organization_id=org.id,
        email=f"{role.value}-{uuid.uuid4().hex[:8]}@acme.io",
        hashed_password=hash_password("password123"),
        full_name="Test User",
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestBuildTrainingCompletion:
    def test_complete_snapshot_returns_dict(self, session: Session) -> None:
        row = _make_outcome(session)
        completion = _build_training_completion(row)
        assert completion is not None
        assert completion["pain_point"] == "Scaling sales ops after the raise"
        assert completion["channel"] == "email"

    def test_missing_pain_point_returns_none(self, session: Session) -> None:
        row = _make_outcome(session, snapshot={"closing_argument": "x"})
        assert _build_training_completion(row) is None

    def test_missing_closing_argument_returns_none(self, session: Session) -> None:
        row = _make_outcome(session, snapshot={"pain_point": "x"})
        assert _build_training_completion(row) is None

    def test_empty_snapshot_returns_none(self, session: Session) -> None:
        row = _make_outcome(session, snapshot={})
        assert _build_training_completion(row) is None


class TestExportStrategyOutcomesJsonl:
    def test_yields_valid_jsonl_chat_format(self, session: Session) -> None:
        _make_outcome(session)
        lines = list(export_strategy_outcomes_jsonl(session))

        assert len(lines) == 1
        example = json.loads(lines[0])
        roles = [m["role"] for m in example["messages"]]
        assert roles == ["system", "user", "assistant"]
        completion = json.loads(example["messages"][2]["content"])
        assert completion["pain_point"] == "Scaling sales ops after the raise"

    def test_defaults_to_won_only(self, session: Session) -> None:
        _make_outcome(session, outcome="won")
        _make_outcome(session, outcome="lost")

        lines = list(export_strategy_outcomes_jsonl(session))
        assert len(lines) == 1

    def test_outcome_none_includes_both(self, session: Session) -> None:
        _make_outcome(session, outcome="won")
        _make_outcome(session, outcome="lost")

        lines = list(export_strategy_outcomes_jsonl(session, outcome=None))
        assert len(lines) == 2

    def test_incomplete_snapshot_skipped(self, session: Session) -> None:
        _make_outcome(session, snapshot={"pain_point": "only this"})
        assert list(export_strategy_outcomes_jsonl(session)) == []

    def test_organization_scoping(self, session: Session) -> None:
        org_a = _make_org(session)
        org_b = _make_org(session)
        _make_outcome(session, organization_id=org_a.id)
        _make_outcome(session, organization_id=org_b.id)

        lines_a = list(export_strategy_outcomes_jsonl(session, organization_id=org_a.id))
        assert len(lines_a) == 1

    def test_limit_respected(self, session: Session) -> None:
        for _ in range(3):
            _make_outcome(session)
        lines = list(export_strategy_outcomes_jsonl(session, limit=2))
        assert len(lines) == 2


class TestMlTrainingExportEndpoint:
    def test_owner_can_export(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        _make_outcome(session, organization_id=org.id)
        headers = _auth_headers(session, org, UserRole.OWNER)

        resp = client.get("/api/v1/organizations/ml-training/export.jsonl", headers=headers)
        assert resp.status_code == 200, resp.text
        lines = [line for line in resp.text.strip().split("\n") if line]
        assert len(lines) == 1
        json.loads(lines[0])  # valid JSON

    def test_admin_cannot_export(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.ADMIN)
        resp = client.get("/api/v1/organizations/ml-training/export.jsonl", headers=headers)
        assert resp.status_code == 403

    def test_unauthenticated_rejected(self, client: TestClient) -> None:
        resp = client.get("/api/v1/organizations/ml-training/export.jsonl")
        assert resp.status_code == 401

    def test_export_scoped_to_own_organization(self, client: TestClient, session: Session) -> None:
        org_a = _make_org(session)
        org_b = _make_org(session)
        _make_outcome(session, organization_id=org_a.id)
        _make_outcome(session, organization_id=org_b.id)
        headers = _auth_headers(session, org_a, UserRole.OWNER)

        resp = client.get("/api/v1/organizations/ml-training/export.jsonl", headers=headers)
        lines = [line for line in resp.text.strip().split("\n") if line]
        assert len(lines) == 1
