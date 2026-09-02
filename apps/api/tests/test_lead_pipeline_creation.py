"""Tests for POST /leads' pipeline_stage/ai_context extension — "save a
lead with or without AI, and pick where it lands in the pipeline" (the
lead-creation form's own new fields).

Companion to test_opportunity_manual_create.py: reuses the same
GenericStrategyGenerator-always-completes fact (rule_based.py) to get a
deterministic READY_TO_ACTION promotion with no live LLM, but this suite's
own point is the interaction that endpoint doesn't have to handle — a rep
picking an initial stage *later* than DETECTED must never get silently
bumped back by the AI call.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.base import OpportunityStatus, UserRole
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.signal import Signal
from app.models.user import User

# Long enough that GenericStrategyGenerator's is_battlecard_complete() check
# passes deterministically — the generator itself doesn't gate on length,
# but a short/empty ai_context is exactly the "sin IA" case this suite
# tests separately.
RICH_AI_CONTEXT = "Vimos que están evaluando proveedores nuevos este trimestre, vale la pena un acercamiento."


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


class TestNoPipelineStageIsUnchangedBehavior:
    def test_lead_without_pipeline_stage_creates_no_opportunity(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgNoStage")
        resp = client.post(
            "/api/v1/leads",
            headers=_auth_headers(owner),
            json={"full_name": "Jane Doe"},
        )
        assert resp.status_code == 201, resp.text
        lead_id = uuid.UUID(resp.json()["id"])
        opps = session.exec(select(Opportunity).where(Opportunity.lead_id == lead_id)).all()
        assert opps == []


class TestNewDealContextFieldsRoundTrip:
    def test_fields_persist_and_default_meetings_count_is_zero(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgFields")
        resp = client.post(
            "/api/v1/leads",
            headers=_auth_headers(owner),
            json={
                "full_name": "Rich Contact",
                "estimated_value": 15000.0,
                "source": "referido",
                "next_meeting_at": "2026-09-10T15:00:00Z",
                "photo_url": "data:image/jpeg;base64,fake",
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["estimated_value"] == 15000.0
        assert body["source"] == "referido"
        assert body["photo_url"] == "data:image/jpeg;base64,fake"
        assert body["meetings_held_count"] == 0


class TestSinIA:
    """pipeline_stage set, ai_context blank — straight to CRM, no AI call."""

    def test_creates_opportunity_at_chosen_stage_with_no_strategy(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgSinIA")
        resp = client.post(
            "/api/v1/leads",
            headers=_auth_headers(owner),
            json={
                "full_name": "No AI Contact",
                "estimated_value": 5000.0,
                "pipeline_stage": "in_progress",
            },
        )
        assert resp.status_code == 201, resp.text
        lead_id = uuid.UUID(resp.json()["id"])

        opp = session.exec(select(Opportunity).where(Opportunity.lead_id == lead_id)).one()
        assert opp.status == OpportunityStatus.IN_PROGRESS
        assert opp.strategy == {}
        assert opp.amount == 5000.0
        assert opp.signal_id is None

        signals = session.exec(select(Signal).where(Signal.lead_id == lead_id)).all()
        assert signals == []


class TestConIA:
    """pipeline_stage + ai_context both set — AI generates a battlecard."""

    def test_detected_stage_promotes_to_ready_to_action(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgConIADetected")
        resp = client.post(
            "/api/v1/leads",
            headers=_auth_headers(owner),
            json={
                "full_name": "AI Contact",
                "pipeline_stage": "detected",
                "ai_context": RICH_AI_CONTEXT,
            },
        )
        assert resp.status_code == 201, resp.text
        lead_id = uuid.UUID(resp.json()["id"])

        opp = session.exec(select(Opportunity).where(Opportunity.lead_id == lead_id)).one()
        # GenericStrategyGenerator (rule_based.py) always produces a
        # complete battlecard — same fact test_opportunity_manual_create.py
        # relies on — so this promotes exactly like the manual-opportunity
        # endpoint's own equivalent test.
        assert opp.status == OpportunityStatus.READY_TO_ACTION
        assert opp.strategy.get("pain_point")
        assert opp.signal_id is not None

    def test_later_stage_is_not_bumped_back_by_the_ai_promotion(
        self, client: TestClient, session: Session
    ) -> None:
        """The regression this suite exists to prevent: a rep who says
        "this lead is already in conversation" must still see it in
        conversation after the AI call, not silently reset to
        ready_to_action just because the battlecard came back complete."""
        org, owner = _make_org_and_owner(session, "OrgConIALater")
        resp = client.post(
            "/api/v1/leads",
            headers=_auth_headers(owner),
            json={
                "full_name": "Already Talking",
                "pipeline_stage": "in_progress",
                "ai_context": RICH_AI_CONTEXT,
            },
        )
        assert resp.status_code == 201, resp.text
        lead_id = uuid.UUID(resp.json()["id"])

        opp = session.exec(select(Opportunity).where(Opportunity.lead_id == lead_id)).one()
        assert opp.status == OpportunityStatus.IN_PROGRESS
        # The strategy content itself is still kept — only the status is
        # protected from the auto-promotion.
        assert opp.strategy.get("pain_point")


class TestReadyToActionIsNotASelectableStage:
    def test_ready_to_action_is_rejected_by_schema(self, client: TestClient, session: Session) -> None:
        org, owner = _make_org_and_owner(session, "OrgRejectRTA")
        resp = client.post(
            "/api/v1/leads",
            headers=_auth_headers(owner),
            json={"full_name": "Sneaky", "pipeline_stage": "ready_to_action"},
        )
        assert resp.status_code == 422
