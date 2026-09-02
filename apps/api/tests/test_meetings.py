"""Tests for POST/GET/PATCH/DELETE /meetings — the team calendar.

Covers: creation with/without an Opportunity or Lead link, the
client_context derivation ("ligado al cerebro de BEE" — active_client /
hot_lead / prospect / new_contact from data BEE already has), date-range
filtering, and the attendee-based visibility rule (an invited MEMBER sees
a meeting created by someone outside their own manager hierarchy).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.user import User


def _make_org(session: Session, name: str) -> Organization:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_user(session: Session, org: Organization, name: str, role: UserRole = UserRole.OWNER) -> User:
    user = User(
        organization_id=org.id,
        email=f"{name.lower()}-{uuid.uuid4().hex[:6]}@x.io",
        hashed_password=hash_password("password123"),
        full_name=name,
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _auth_headers(user: User) -> dict:
    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestCreateMeeting:
    def test_requires_authentication(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/meetings",
            json={"title": "Sync", "starts_at": datetime.now(UTC).isoformat()},
        )
        assert resp.status_code == 401

    def test_creates_a_bare_internal_meeting_with_new_contact_context(
        self, client: TestClient, session: Session
    ) -> None:
        org = _make_org(session, "OrgMeet1")
        owner = _make_user(session, org, "Owner")
        starts_at = datetime.now(UTC) + timedelta(days=1)

        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Weekly sync",
                "starts_at": starts_at.isoformat(),
                "duration_minutes": 45,
                "meeting_url": "https://meet.google.com/abc-defg-hij",
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["duration_minutes"] == 45
        assert body["meeting_url"] == "https://meet.google.com/abc-defg-hij"
        assert body["client_context"] == "new_contact"
        assert body["company_name"] is None

    def test_hot_lead_context_derived_from_lead_score(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeet2")
        owner = _make_user(session, org, "Owner")
        lead = Lead(organization_id=org.id, full_name="Hot Lead", score=90.0)
        session.add(lead)
        session.commit()
        session.refresh(lead)

        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Discovery call",
                "lead_id": str(lead.id),
                "starts_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["client_context"] == "hot_lead"
        assert body["contact_name"] == "Hot Lead"

    def test_active_client_context_from_expansion_opportunity(
        self, client: TestClient, session: Session
    ) -> None:
        org = _make_org(session, "OrgMeet3")
        owner = _make_user(session, org, "Owner")
        opp = Opportunity(
            organization_id=org.id,
            title="Acme Expansion",
            status="in_progress",
            opportunity_type="expansion",
        )
        session.add(opp)
        session.commit()
        session.refresh(opp)

        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Upsell conversation",
                "opportunity_id": str(opp.id),
                "starts_at": (datetime.now(UTC) + timedelta(hours=3)).isoformat(),
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["client_context"] == "active_client"

    def test_prospect_context_from_new_logo_opportunity(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeet4")
        owner = _make_user(session, org, "Owner")
        opp = Opportunity(organization_id=org.id, title="New Co", status="detected", opportunity_type="new_logo")
        session.add(opp)
        session.commit()
        session.refresh(opp)

        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Intro call",
                "opportunity_id": str(opp.id),
                "starts_at": (datetime.now(UTC) + timedelta(hours=4)).isoformat(),
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["client_context"] == "prospect"

    def test_unknown_opportunity_id_404s(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeet5")
        owner = _make_user(session, org, "Owner")
        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Ghost",
                "opportunity_id": str(uuid.uuid4()),
                "starts_at": datetime.now(UTC).isoformat(),
            },
        )
        assert resp.status_code == 404


class TestListMeetings:
    def test_date_range_filter(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeetList")
        owner = _make_user(session, org, "Owner")
        now = datetime.now(UTC)

        for offset_days in (-5, 1, 10):
            client.post(
                "/api/v1/meetings",
                headers=_auth_headers(owner),
                json={
                    "title": f"Meeting {offset_days}",
                    "starts_at": (now + timedelta(days=offset_days)).isoformat(),
                },
            )

        resp = client.get(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            params={
                "starts_after": (now - timedelta(days=1)).isoformat(),
                "starts_before": (now + timedelta(days=7)).isoformat(),
            },
        )
        assert resp.status_code == 200
        titles = [m["title"] for m in resp.json()]
        assert titles == ["Meeting 1"]


class TestMeetingVisibility:
    def test_invited_member_sees_meeting_created_outside_their_hierarchy(
        self, client: TestClient, session: Session
    ) -> None:
        org = _make_org(session, "OrgMeetVis")
        owner = _make_user(session, org, "Owner")
        member = _make_user(session, org, "Member", role=UserRole.MEMBER)

        create_resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Cross-team sync",
                "starts_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                "attendee_user_ids": [str(member.id)],
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        meeting_id = create_resp.json()["id"]

        get_resp = client.get(f"/api/v1/meetings/{meeting_id}", headers=_auth_headers(member))
        assert get_resp.status_code == 200

    def test_member_cannot_see_a_meeting_they_are_not_invited_to(
        self, client: TestClient, session: Session
    ) -> None:
        org = _make_org(session, "OrgMeetVis2")
        owner = _make_user(session, org, "Owner")
        other_member = _make_user(session, org, "Other Member", role=UserRole.MEMBER)
        outsider = _make_user(session, org, "Outsider", role=UserRole.MEMBER)

        create_resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Private 1:1",
                "starts_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                "attendee_user_ids": [str(other_member.id)],
            },
        )
        meeting_id = create_resp.json()["id"]

        get_resp = client.get(f"/api/v1/meetings/{meeting_id}", headers=_auth_headers(outsider))
        assert get_resp.status_code == 404


class TestUpdateAndDeleteMeeting:
    def test_reschedule_and_delete(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeetEdit")
        owner = _make_user(session, org, "Owner")
        create_resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={"title": "Draft", "starts_at": datetime.now(UTC).isoformat()},
        )
        meeting_id = create_resp.json()["id"]
        new_time = (datetime.now(UTC) + timedelta(days=2)).isoformat()

        patch_resp = client.patch(
            f"/api/v1/meetings/{meeting_id}",
            headers=_auth_headers(owner),
            json={"starts_at": new_time, "duration_minutes": 60},
        )
        assert patch_resp.status_code == 200, patch_resp.text
        assert patch_resp.json()["duration_minutes"] == 60

        delete_resp = client.delete(f"/api/v1/meetings/{meeting_id}", headers=_auth_headers(owner))
        assert delete_resp.status_code == 204

        get_resp = client.get(f"/api/v1/meetings/{meeting_id}", headers=_auth_headers(owner))
        assert get_resp.status_code == 404


class TestMeetingColor:
    """Personal color tag — freely picked, unlike client_context which BEE
    derives (see ClientContext's own docstring in schemas/meeting.py)."""

    def test_create_with_color(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeetColor")
        owner = _make_user(session, org, "Owner")
        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Color-tagged",
                "starts_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                "color": "chart-3",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["color"] == "chart-3"

    def test_defaults_to_none(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeetColorNone")
        owner = _make_user(session, org, "Owner")
        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={"title": "No color", "starts_at": datetime.now(UTC).isoformat()},
        )
        assert resp.json()["color"] is None

    def test_invalid_color_rejected(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeetColorBad")
        owner = _make_user(session, org, "Owner")
        resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={
                "title": "Bad color",
                "starts_at": datetime.now(UTC).isoformat(),
                "color": "hotpink",
            },
        )
        assert resp.status_code == 422

    def test_update_color(self, client: TestClient, session: Session) -> None:
        org = _make_org(session, "OrgMeetColorUpdate")
        owner = _make_user(session, org, "Owner")
        create_resp = client.post(
            "/api/v1/meetings",
            headers=_auth_headers(owner),
            json={"title": "Recolor me", "starts_at": datetime.now(UTC).isoformat()},
        )
        meeting_id = create_resp.json()["id"]

        patch_resp = client.patch(
            f"/api/v1/meetings/{meeting_id}",
            headers=_auth_headers(owner),
            json={"color": "chart-6"},
        )
        assert patch_resp.status_code == 200, patch_resp.text
        assert patch_resp.json()["color"] == "chart-6"
