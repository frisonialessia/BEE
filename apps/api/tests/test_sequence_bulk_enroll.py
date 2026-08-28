"""Tests for bulk sequence enrollment (POST /sequences/executions/bulk) and
the sequence-level seniority target-segment field — the two pieces that
close the loop between Leads and Secuencias (see
app.services.dynamic_sequence.service.bulk_start_execution and
app.models.sequence.DynamicSequence.seniority).
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.schemas.sequence import SequenceCreate, StepDefinition, StepTransition
from app.services.dynamic_sequence import DynamicSequenceEngine


def _one_step_sequence(name: str, **extra) -> SequenceCreate:
    return SequenceCreate(
        name=name,
        entry_step_id="s1",
        steps=[
            StepDefinition(
                id="s1",
                name="Intro",
                action="send_email",
                channel="email",
                transitions=[StepTransition(condition="replied", next_step_id=None)],
            )
        ],
        **extra,
    )


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestSequenceSeniorityField:
    def test_persists_through_create(self, session: Session):
        engine = DynamicSequenceEngine(session)
        seq = engine.create_sequence(_one_step_sequence("VP outreach", industry="Fintech", seniority="vp"))
        session.commit()
        assert seq.seniority == "vp"

    def test_defaults_to_none(self, session: Session):
        engine = DynamicSequenceEngine(session)
        seq = engine.create_sequence(_one_step_sequence("No segment"))
        session.commit()
        assert seq.seniority is None

    def test_round_trips_through_the_api(self, client: TestClient):
        auth = _register(client, org_name="Seniority Co", email="owner@seniority.co")
        headers = _auth_headers(auth["access_token"])
        resp = client.post(
            "/api/v1/sequences",
            headers=headers,
            json=_one_step_sequence("C-level play", seniority="c_level").model_dump(),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["seniority"] == "c_level"


class TestBulkStartExecution:
    def test_enrolls_every_lead_and_creates_pending_actions(self, session: Session):
        engine = DynamicSequenceEngine(session)
        seq = engine.create_sequence(_one_step_sequence("bulk_test"))
        session.commit()

        lead_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        result = engine.bulk_start_execution(seq.id, lead_ids)
        session.commit()

        assert len(result.created) == 3
        assert {e.lead_id for e in result.created} == set(lead_ids)
        assert all(e.pending_action_ids for e in result.created)
        assert result.failed == []

    def test_unknown_sequence_raises_immediately(self, session: Session):
        engine = DynamicSequenceEngine(session)
        with pytest.raises(ValueError, match="not found"):
            engine.bulk_start_execution(uuid.uuid4(), [uuid.uuid4()])


class TestBulkExecutionEndpoint:
    def test_requires_auth(self, client: TestClient):
        resp = client.post(
            "/api/v1/sequences/executions/bulk",
            json={"sequence_id": str(uuid.uuid4()), "lead_ids": [str(uuid.uuid4())]},
        )
        assert resp.status_code == 401

    def test_happy_path_enrolls_all_selected_leads(self, client: TestClient):
        auth = _register(client, org_name="Bulk Enroll Co", email="owner@bulkenroll.co")
        headers = _auth_headers(auth["access_token"])

        seq_resp = client.post(
            "/api/v1/sequences", headers=headers, json=_one_step_sequence("bulk_endpoint").model_dump()
        )
        sequence_id = seq_resp.json()["id"]
        lead_ids = [str(uuid.uuid4()) for _ in range(4)]

        resp = client.post(
            "/api/v1/sequences/executions/bulk",
            headers=headers,
            json={"sequence_id": sequence_id, "lead_ids": lead_ids},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert len(body["created"]) == 4
        assert body["failed"] == []
        assert {e["lead_id"] for e in body["created"]} == set(lead_ids)

        listed = client.get(
            "/api/v1/sequences/executions", headers=headers, params={"sequence_id": sequence_id}
        )
        assert len(listed.json()) == 4

    def test_unknown_sequence_returns_404(self, client: TestClient):
        auth = _register(client, org_name="Missing Seq Co", email="owner@missingseq.co")
        resp = client.post(
            "/api/v1/sequences/executions/bulk",
            headers=_auth_headers(auth["access_token"]),
            json={"sequence_id": str(uuid.uuid4()), "lead_ids": [str(uuid.uuid4())]},
        )
        assert resp.status_code == 404

    def test_empty_lead_list_rejected(self, client: TestClient):
        auth = _register(client, org_name="Empty List Co", email="owner@emptylist.co")
        resp = client.post(
            "/api/v1/sequences/executions/bulk",
            headers=_auth_headers(auth["access_token"]),
            json={"sequence_id": str(uuid.uuid4()), "lead_ids": []},
        )
        assert resp.status_code == 422

    def test_cross_org_isolation(self, client: TestClient):
        """A sequence created by one organization can't be bulk-enrolled
        into by another — same tenant boundary every other sequence
        endpoint enforces (see module docstring in endpoints/sequences.py)."""
        owner_a = _register(client, org_name="Org A", email="owner@orga.co")
        seq_resp = client.post(
            "/api/v1/sequences",
            headers=_auth_headers(owner_a["access_token"]),
            json=_one_step_sequence("org_a_seq").model_dump(),
        )
        sequence_id = seq_resp.json()["id"]

        owner_b = _register(client, org_name="Org B", email="owner@orgb.co")
        resp = client.post(
            "/api/v1/sequences/executions/bulk",
            headers=_auth_headers(owner_b["access_token"]),
            json={"sequence_id": sequence_id, "lead_ids": [str(uuid.uuid4())]},
        )
        assert resp.status_code == 404
