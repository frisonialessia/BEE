"""Tests for POST /meetings/{id}/complete — the one place a meeting
actually feeds back into the rest of BEE (Lead/Opportunity.
meetings_held_count, an ENGAGEMENT Signal). See
app/services/meeting_engagement.py and Meeting.completed_at's own
docstring for why scheduling a meeting alone doesn't do any of this.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.base import SignalType, UserRole
from app.models.lead import Lead
from app.models.meeting import Meeting
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.signal import Signal
from app.models.user import User


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


class TestCompleteMeeting:
    def test_completing_a_meeting_linked_to_an_opportunity_increments_its_count(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgMeetingComplete")
        opp = Opportunity(organization_id=org.id, title="Nimbus deal", strategy={})
        session.add(opp)
        session.commit()
        session.refresh(opp)
        assert opp.meetings_held_count == 0

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

        resp = client.post(f"/api/v1/meetings/{meeting.id}/complete", headers=_auth_headers(owner))
        assert resp.status_code == 200, resp.text
        assert resp.json()["completed_at"] is not None

        session.expire_all()
        opp = session.get(Opportunity, opp.id)
        assert opp is not None and opp.meetings_held_count == 1

    def test_completing_a_meeting_linked_to_a_lead_increments_its_count(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgMeetingCompleteLead")
        lead = Lead(organization_id=org.id, full_name="Jane Doe")
        session.add(lead)
        session.commit()
        session.refresh(lead)

        meeting = Meeting(
            organization_id=org.id,
            created_by_user_id=owner.id,
            lead_id=lead.id,
            title="Intro call",
            starts_at=datetime.now(UTC) - timedelta(hours=1),
        )
        session.add(meeting)
        session.commit()
        session.refresh(meeting)
        meeting_id = meeting.id

        resp = client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=_auth_headers(owner))
        assert resp.status_code == 200, resp.text

        session.expire_all()
        lead = session.get(Lead, lead.id)
        assert lead is not None and lead.meetings_held_count == 1

        engagement_signals = session.exec(
            select(Signal).where(Signal.lead_id == lead.id, Signal.signal_type == SignalType.ENGAGEMENT)
        ).all()
        assert len(engagement_signals) == 1
        assert engagement_signals[0].raw_payload.get("meeting_id") == str(meeting_id)

    def test_completing_is_idempotent(self, client: TestClient, session: Session) -> None:
        org, owner = _make_org_and_owner(session, "OrgMeetingCompleteTwice")
        lead = Lead(organization_id=org.id, full_name="Jane Doe")
        session.add(lead)
        session.commit()
        session.refresh(lead)

        meeting = Meeting(
            organization_id=org.id,
            created_by_user_id=owner.id,
            lead_id=lead.id,
            title="Intro call",
            starts_at=datetime.now(UTC) - timedelta(hours=1),
        )
        session.add(meeting)
        session.commit()
        session.refresh(meeting)
        meeting_id = meeting.id

        first = client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=_auth_headers(owner))
        second = client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=_auth_headers(owner))
        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["completed_at"] == second.json()["completed_at"]

        session.expire_all()
        lead = session.get(Lead, lead.id)
        assert lead is not None and lead.meetings_held_count == 1

    def test_scheduling_alone_does_not_increment_anything(self, client: TestClient, session: Session) -> None:
        """The regression this file exists to prevent — a meeting that's
        merely scheduled (never completed) must not feed back into
        anything, per Meeting.completed_at's own docstring."""
        org, owner = _make_org_and_owner(session, "OrgMeetingScheduledOnly")
        lead = Lead(organization_id=org.id, full_name="Jane Doe")
        session.add(lead)
        session.commit()
        session.refresh(lead)

        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Future call",
                "starts_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                "lead_id": str(lead.id),
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["completed_at"] is None

        session.expire_all()
        lead = session.get(Lead, lead.id)
        assert lead is not None and lead.meetings_held_count == 0

    def test_completing_someone_elses_hidden_meeting_returns_404(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgMeetingCompleteHidden")
        other_org, other_owner = _make_org_and_owner(session, "OrgMeetingCompleteOther")
        meeting = Meeting(
            organization_id=other_org.id,
            created_by_user_id=other_owner.id,
            title="Not yours",
            starts_at=datetime.now(UTC) - timedelta(hours=1),
        )
        session.add(meeting)
        session.commit()
        session.refresh(meeting)

        resp = client.post(f"/api/v1/meetings/{meeting.id}/complete", headers=_auth_headers(owner))
        assert resp.status_code == 404
