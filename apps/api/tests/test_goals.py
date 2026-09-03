"""Goals per rep — revenue and/or new-clients targets, team currency, and
who may set them (OWNER/ADMIN for anyone, MANAGER for their own subtree)."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.team import Team
from app.models.user import User


def _org(session: Session) -> Organization:
    org = Organization(name="Goals Org", slug=f"goals-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _team(session: Session, org: Organization, name: str, parent: Team | None = None) -> Team:
    team = Team(organization_id=org.id, name=name, parent_team_id=parent.id if parent else None)
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


def _user(session: Session, org: Organization, role: UserRole, team: Team | None = None) -> tuple[User, dict]:
    user = User(
        organization_id=org.id,
        team_id=team.id if team else None,
        email=f"{role.value}-{uuid.uuid4().hex[:6]}@bee.ai",
        hashed_password=hash_password("password123"),
        full_name=f"{role.value.title()} Rep",
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user, {"Authorization": f"Bearer {create_access_token(user.id, organization_id=org.id, role=role.value)}"}


class TestGoalShape:
    def test_amount_or_count_or_both(self, client: TestClient, session: Session):
        org = _org(session)
        owner, headers = _user(session, org, UserRole.OWNER)
        base = {"user_id": str(owner.id), "period_start": "2026-09-01", "period_end": "2026-09-30"}
        assert client.post("/api/v1/quotas", headers=headers, json=base).status_code == 422
        r = client.post("/api/v1/quotas", headers=headers, json={**base, "target_count": 4})
        assert r.status_code == 201 and r.json()["target_amount"] == 0 and r.json()["target_count"] == 4
        r = client.post("/api/v1/quotas", headers=headers, json={**base, "target_amount": 50000, "target_count": 3})
        assert r.status_code == 201 and r.json()["target_count"] == 3

    def test_team_currency_round_trips(self, client: TestClient, session: Session):
        org = _org(session)
        team = _team(session, org, "LatAm")
        _, headers = _user(session, org, UserRole.OWNER)
        r = client.patch(f"/api/v1/teams/{team.id}", headers=headers, json={"currency": "mxn"})
        assert r.status_code == 200 and r.json()["currency"] == "MXN"
        assert client.patch(f"/api/v1/teams/{team.id}", headers=headers, json={"currency": "pesos"}).status_code == 422
        listed = client.get("/api/v1/teams", headers=headers).json()
        assert any(t["currency"] == "MXN" for t in listed)


class TestWhoMaySetGoals:
    def test_manager_sets_goals_only_inside_their_subtree(self, client: TestClient, session: Session):
        org = _org(session)
        north = _team(session, org, "Norte")
        north_sub = _team(session, org, "Norte · SDR", parent=north)
        south = _team(session, org, "Sur")
        manager, headers = _user(session, org, UserRole.MANAGER, north)
        mine, _ = _user(session, org, UserRole.MEMBER, north_sub)
        theirs, _ = _user(session, org, UserRole.MEMBER, south)
        period = {"period_start": "2026-09-01", "period_end": "2026-09-30", "target_amount": 20000}

        ok = client.post("/api/v1/quotas", headers=headers, json={**period, "user_id": str(mine.id)})
        assert ok.status_code == 201, ok.text
        assert client.post("/api/v1/quotas", headers=headers, json={**period, "user_id": str(theirs.id)}).status_code == 404
        assert client.post("/api/v1/quotas", headers=headers, json={**period, "team_id": str(north_sub.id)}).status_code == 201
        assert client.post("/api/v1/quotas", headers=headers, json={**period, "team_id": str(south.id)}).status_code == 404

        # Editing follows the same rule.
        quota_id = ok.json()["id"]
        assert client.patch(f"/api/v1/quotas/{quota_id}", headers=headers, json={"target_count": 2}).status_code == 200
        assert client.delete(f"/api/v1/quotas/{quota_id}", headers=headers).status_code == 204

    def test_member_cannot_set_goals(self, client: TestClient, session: Session):
        org = _org(session)
        member, headers = _user(session, org, UserRole.MEMBER)
        r = client.post(
            "/api/v1/quotas",
            headers=headers,
            json={"user_id": str(member.id), "period_start": "2026-09-01", "period_end": "2026-09-30", "target_amount": 1},
        )
        assert r.status_code == 403

    def test_admin_cannot_target_another_organization(self, client: TestClient, session: Session):
        org_a = _org(session)
        org_b = _org(session)
        _, headers = _user(session, org_a, UserRole.ADMIN)
        stranger, _ = _user(session, org_b, UserRole.MEMBER)
        r = client.post(
            "/api/v1/quotas",
            headers=headers,
            json={"user_id": str(stranger.id), "period_start": "2026-09-01", "period_end": "2026-09-30", "target_amount": 1},
        )
        assert r.status_code == 404
