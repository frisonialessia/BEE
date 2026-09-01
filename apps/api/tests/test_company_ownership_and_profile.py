"""Tests for the RBAC gap-fix: Company.owner_user_id visibility scoping,
self-service user profile (PATCH/DELETE /users/me), and the real account
activity feed (AccountActivityEvent).
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.company import Company
from app.models.organization import Organization
from app.models.team import Team
from app.models.user import User


def _make_org(session: Session, name: str) -> Organization:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_user(
    session: Session,
    org: Organization,
    role: UserRole,
    *,
    email: str | None = None,
    team: Team | None = None,
) -> User:
    user = User(
        organization_id=org.id,
        team_id=team.id if team else None,
        email=email or f"{uuid.uuid4().hex[:10]}@x.io",
        hashed_password=hash_password("password123"),
        full_name="Test User",
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_team(session: Session, org: Organization, name: str, parent: Team | None = None) -> Team:
    team = Team(organization_id=org.id, name=name, parent_team_id=parent.id if parent else None)
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


def _headers(user: User) -> dict:
    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestCompanyOwnershipVisibility:
    def test_member_only_sees_own_companies(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme")
        team = _make_team(session, org, "Sales")
        member = _make_user(session, org, UserRole.MEMBER, team=team)
        other_member = _make_user(session, org, UserRole.MEMBER, team=team)

        session.add(Company(name="Mine", organization_id=org.id, owner_user_id=member.id))
        session.add(Company(name="Theirs", organization_id=org.id, owner_user_id=other_member.id))
        session.commit()

        resp = client.get("/api/v1/companies", headers=_headers(member))
        names = [c["name"] for c in resp.json()]
        assert names == ["Mine"]

    def test_unowned_company_visible_by_id_to_everyone(self, client: TestClient, session: Session):
        """The "untagged = visible to everyone" guarantee is what
        ``_hidden_from``/``user_can_view_assignment`` promise for the
        single-record detail endpoint — same as Lead/Opportunity, ``GET
        /companies`` (the list endpoint)'s SQL ``IN`` filter never matches a
        NULL ``owner_user_id`` for a restricted (MEMBER/MANAGER) caller, so
        an unowned record can be fetched by id but doesn't appear in a
        MEMBER's list page. That's an existing, identical limitation on
        Lead/Opportunity's own list_scoped, not something new here.
        """
        org = _make_org(session, "Acme Unowned")
        member = _make_user(session, org, UserRole.MEMBER)
        company = Company(name="Nobody's yet", organization_id=org.id, owner_user_id=None)
        session.add(company)
        session.commit()
        session.refresh(company)

        resp = client.get(f"/api/v1/companies/{company.id}", headers=_headers(member))
        assert resp.status_code == 200
        assert resp.json()["name"] == "Nobody's yet"

    def test_manager_sees_team_owned_companies(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Manager")
        team = _make_team(session, org, "Sales")
        manager = _make_user(session, org, UserRole.MANAGER, team=team)
        rep = _make_user(session, org, UserRole.MEMBER, team=team)

        session.add(Company(name="Rep's account", organization_id=org.id, owner_user_id=rep.id))
        session.commit()

        resp = client.get("/api/v1/companies", headers=_headers(manager))
        names = [c["name"] for c in resp.json()]
        assert "Rep's account" in names

    def test_member_gets_404_for_teammates_company_detail(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Detail")
        member = _make_user(session, org, UserRole.MEMBER)
        other = _make_user(session, org, UserRole.MEMBER)
        company = Company(name="Not yours", organization_id=org.id, owner_user_id=other.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        resp = client.get(f"/api/v1/companies/{company.id}", headers=_headers(member))
        assert resp.status_code == 404

    def test_owner_can_reassign_company(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Reassign")
        owner = _make_user(session, org, UserRole.OWNER)
        rep = _make_user(session, org, UserRole.MEMBER)
        company = Company(name="Reassign me", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        resp = client.patch(
            f"/api/v1/companies/{company.id}",
            json={"owner_user_id": str(rep.id)},
            headers=_headers(owner),
        )
        assert resp.status_code == 200
        assert resp.json()["owner_user_id"] == str(rep.id)

    def test_cannot_reassign_to_user_in_another_org(self, client: TestClient, session: Session):
        org_a = _make_org(session, "Org A Reassign")
        org_b = _make_org(session, "Org B Reassign")
        owner_a = _make_user(session, org_a, UserRole.OWNER)
        user_b = _make_user(session, org_b, UserRole.MEMBER)
        company = Company(name="Cross-org", organization_id=org_a.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        resp = client.patch(
            f"/api/v1/companies/{company.id}",
            json={"owner_user_id": str(user_b.id)},
            headers=_headers(owner_a),
        )
        assert resp.status_code == 404


class TestAccountActivityFeed:
    def test_viewing_a_company_records_an_activity_event(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Activity")
        owner = _make_user(session, org, UserRole.OWNER)
        company = Company(name="Watched", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        client.get(f"/api/v1/companies/{company.id}", headers=_headers(owner))

        resp = client.get(f"/api/v1/companies/{company.id}/activity", headers=_headers(owner))
        events = resp.json()
        assert len(events) == 1
        assert events[0]["event_type"] == "viewed"
        assert events[0]["user_full_name"] == owner.full_name

    def test_editing_a_company_records_an_edited_event(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Edit Activity")
        owner = _make_user(session, org, UserRole.OWNER)
        company = Company(name="Editable", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        client.patch(
            f"/api/v1/companies/{company.id}",
            json={"description": "Updated description"},
            headers=_headers(owner),
        )

        resp = client.get(f"/api/v1/companies/{company.id}/activity", headers=_headers(owner))
        event_types = [e["event_type"] for e in resp.json()]
        assert "edited" in event_types

    def test_reassigning_a_company_records_an_assigned_event(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Assign Activity")
        owner = _make_user(session, org, UserRole.OWNER)
        rep = _make_user(session, org, UserRole.MEMBER)
        company = Company(name="Assignable", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        client.patch(
            f"/api/v1/companies/{company.id}",
            json={"owner_user_id": str(rep.id)},
            headers=_headers(owner),
        )

        resp = client.get(f"/api/v1/companies/{company.id}/activity", headers=_headers(owner))
        event_types = [e["event_type"] for e in resp.json()]
        assert "assigned" in event_types


class TestSelfServiceProfile:
    def test_user_can_update_own_profile(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Profile")
        user = _make_user(session, org, UserRole.MEMBER)

        resp = client.patch(
            "/api/v1/users/me",
            json={"phone": "+1 555 0100", "bio": "Closes deals.", "avatar_url": "https://x.io/a.png"},
            headers=_headers(user),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["phone"] == "+1 555 0100"
        assert body["bio"] == "Closes deals."
        assert body["avatar_url"] == "https://x.io/a.png"

    def test_profile_update_cannot_change_role(self, client: TestClient, session: Session):
        """UserProfileUpdateIn has no `role` field at all — a MEMBER sending
        one is simply ignored by FastAPI request validation (extra fields
        are dropped), not silently applied."""
        org = _make_org(session, "Acme Profile Role")
        user = _make_user(session, org, UserRole.MEMBER)

        resp = client.patch(
            "/api/v1/users/me",
            json={"full_name": "New Name", "role": "owner"},
            headers=_headers(user),
        )
        assert resp.status_code == 200
        session.refresh(user)
        assert user.role == UserRole.MEMBER
        assert user.full_name == "New Name"

    def test_member_can_delete_own_account(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Self Delete")
        user = _make_user(session, org, UserRole.MEMBER)

        resp = client.delete("/api/v1/users/me", headers=_headers(user))
        assert resp.status_code == 204
        session.refresh(user)
        assert user.is_active is False

    def test_owner_cannot_delete_own_account(self, client: TestClient, session: Session):
        org = _make_org(session, "Acme Owner No Delete")
        owner = _make_user(session, org, UserRole.OWNER)

        resp = client.delete("/api/v1/users/me", headers=_headers(owner))
        assert resp.status_code == 403
        session.refresh(owner)
        assert owner.is_active is True
