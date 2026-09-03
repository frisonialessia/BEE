"""Tests for multi-tenant auth: Organization / Team / User, JWT, and
manager-hierarchy visibility scoping.

Covers:
1. Password hashing (bcrypt) + JWT session tokens (core.security)
2. AuthService — organization registration, authentication
3. PermissionsService — team-tree traversal, role-based visibility
4. HTTP endpoints — /auth, /teams, /users, and the opportunities visibility retrofit
"""

from __future__ import annotations

import time
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.base import OpportunityStatus, UserRole
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.team import Team
from app.models.user import User
from app.schemas.auth import OrganizationRegister
from app.services.auth import AuthService
from app.services.permissions import get_descendant_team_ids, get_visible_user_ids

# ---------------------------------------------------------------------------
# 1. Password hashing + JWT
# ---------------------------------------------------------------------------


class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        hashed = hash_password("correct horse battery staple")
        assert hashed != "correct horse battery staple"
        assert hashed.startswith("$2b$")  # bcrypt hash prefix

    def test_verify_correct_password(self):
        hashed = hash_password("hunter2")
        assert verify_password("hunter2", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("hunter2")
        assert verify_password("wrong-password", hashed) is False

    def test_verify_malformed_hash_returns_false_not_raises(self):
        assert verify_password("anything", "not-a-real-bcrypt-hash") is False

    def test_two_hashes_of_same_password_differ(self):
        """Each hash uses a fresh random salt (bcrypt.gensalt())."""
        assert hash_password("same-password") != hash_password("same-password")


class TestJWT:
    def test_create_and_decode_round_trip(self):
        user_id = uuid.uuid4()
        org_id = uuid.uuid4()
        token = create_access_token(user_id, organization_id=org_id, role="admin")

        payload = decode_access_token(token)
        assert payload["sub"] == str(user_id)
        assert payload["org"] == str(org_id)
        assert payload["role"] == "admin"
        assert payload["type"] == "user"

    def test_decode_rejects_tampered_token(self):
        token = create_access_token(uuid.uuid4(), organization_id=uuid.uuid4(), role="member")
        tampered = token[:-4] + ("aaaa" if not token.endswith("aaaa") else "bbbb")
        with pytest.raises(InvalidTokenError):
            decode_access_token(tampered)

    def test_decode_rejects_expired_token(self):
        token = create_access_token(
            uuid.uuid4(), organization_id=uuid.uuid4(), role="member", expires_minutes=0
        )
        time.sleep(1.1)
        with pytest.raises(InvalidTokenError):
            decode_access_token(token)

    def test_decode_rejects_garbage(self):
        with pytest.raises(InvalidTokenError):
            decode_access_token("not-a-jwt-at-all")


# ---------------------------------------------------------------------------
# 2. AuthService
# ---------------------------------------------------------------------------


class TestAuthService:
    def test_register_organization_creates_owner(self, session: Session):
        service = AuthService(session)
        org, user = service.register_organization(
            OrganizationRegister(
                organization_name="Acme Inc",
                full_name="Alice Owner",
                email="alice@acme.io",
                password="supersecret123",
            )
        )
        assert org.slug == "acme-inc"
        assert user.role == UserRole.OWNER
        assert user.organization_id == org.id
        assert verify_password("supersecret123", user.hashed_password)

    def test_register_duplicate_email_raises(self, session: Session):
        service = AuthService(session)
        data = OrganizationRegister(
            organization_name="Acme Inc",
            full_name="Alice Owner",
            email="dup@acme.io",
            password="supersecret123",
        )
        service.register_organization(data)

        with pytest.raises(ValueError, match="already registered"):
            service.register_organization(
                OrganizationRegister(
                    organization_name="Other Org",
                    full_name="Bob",
                    email="dup@acme.io",
                    password="anotherpassword",
                )
            )

    def test_register_duplicate_org_name_gets_unique_slug(self, session: Session):
        service = AuthService(session)
        org1, _ = service.register_organization(
            OrganizationRegister(
                organization_name="Acme Inc", full_name="A", email="a@x.io", password="password123"
            )
        )
        org2, _ = service.register_organization(
            OrganizationRegister(
                organization_name="Acme Inc", full_name="B", email="b@x.io", password="password123"
            )
        )
        assert org1.slug != org2.slug
        assert org2.slug.startswith("acme-inc")

    def test_authenticate_success(self, session: Session):
        service = AuthService(session)
        service.register_organization(
            OrganizationRegister(
                organization_name="Acme", full_name="Alice", email="alice@x.io", password="correcthorse"
            )
        )
        user = service.authenticate("alice@x.io", "correcthorse")
        assert user is not None
        assert user.email == "alice@x.io"

    def test_authenticate_wrong_password_returns_none(self, session: Session):
        service = AuthService(session)
        service.register_organization(
            OrganizationRegister(
                organization_name="Acme", full_name="Alice", email="alice2@x.io", password="correcthorse"
            )
        )
        assert service.authenticate("alice2@x.io", "wrong") is None

    def test_authenticate_unknown_email_returns_none(self, session: Session):
        service = AuthService(session)
        assert service.authenticate("nobody@nowhere.io", "whatever") is None

    def test_authenticate_inactive_user_returns_none(self, session: Session):
        service = AuthService(session)
        _, user = service.register_organization(
            OrganizationRegister(
                organization_name="Acme", full_name="Alice", email="alice3@x.io", password="correcthorse"
            )
        )
        user.is_active = False
        session.add(user)
        session.commit()
        assert service.authenticate("alice3@x.io", "correcthorse") is None


# ---------------------------------------------------------------------------
# 3. PermissionsService — team tree + role visibility
# ---------------------------------------------------------------------------


def _make_org(session: Session) -> Organization:
    org = Organization(name="TestOrg", slug=f"testorg-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.flush()
    return org


def _make_team(session: Session, org: Organization, name: str, parent: Team | None = None) -> Team:
    team = Team(organization_id=org.id, name=name, parent_team_id=parent.id if parent else None)
    session.add(team)
    session.flush()
    return team


def _make_user(session: Session, org: Organization, role: UserRole, team: Team | None = None, email: str | None = None) -> User:
    user = User(
        organization_id=org.id,
        team_id=team.id if team else None,
        email=email or f"{uuid.uuid4().hex}@x.io",
        hashed_password=hash_password("password123"),
        full_name="Test User",
        role=role,
    )
    session.add(user)
    session.flush()
    return user


class TestDescendantTeamIds:
    def test_leaf_team_returns_only_itself(self, session: Session):
        org = _make_org(session)
        team = _make_team(session, org, "Leaf")
        assert get_descendant_team_ids(session, team.id) == {team.id}

    def test_returns_full_subtree(self, session: Session):
        org = _make_org(session)
        root = _make_team(session, org, "VP Sales")
        mid1 = _make_team(session, org, "Manager A", parent=root)
        mid2 = _make_team(session, org, "Manager B", parent=root)
        leaf = _make_team(session, org, "Rep team", parent=mid1)

        result = get_descendant_team_ids(session, root.id)
        assert result == {root.id, mid1.id, mid2.id, leaf.id}

    def test_sibling_subtree_not_included(self, session: Session):
        org = _make_org(session)
        root = _make_team(session, org, "Root")
        branch_a = _make_team(session, org, "Branch A", parent=root)
        branch_b = _make_team(session, org, "Branch B", parent=root)

        # Querying from branch_a must not pull in branch_b's subtree.
        result = get_descendant_team_ids(session, branch_a.id)
        assert branch_b.id not in result


class TestVisibleUserIds:
    def test_owner_sees_everyone(self, session: Session):
        org = _make_org(session)
        owner = _make_user(session, org, UserRole.OWNER)
        _make_user(session, org, UserRole.MEMBER)
        assert get_visible_user_ids(session, owner) is None

    def test_admin_sees_everyone(self, session: Session):
        org = _make_org(session)
        admin = _make_user(session, org, UserRole.ADMIN)
        assert get_visible_user_ids(session, admin) is None

    def test_member_sees_only_self(self, session: Session):
        org = _make_org(session)
        team = _make_team(session, org, "Team A")
        member = _make_user(session, org, UserRole.MEMBER, team=team)
        _make_user(session, org, UserRole.MEMBER, team=team)  # a teammate, not visible

        assert get_visible_user_ids(session, member) == {member.id}

    def test_manager_sees_self_and_direct_team(self, session: Session):
        org = _make_org(session)
        team = _make_team(session, org, "Team A")
        manager = _make_user(session, org, UserRole.MANAGER, team=team)
        rep = _make_user(session, org, UserRole.MEMBER, team=team)

        visible = get_visible_user_ids(session, manager)
        assert visible == {manager.id, rep.id}

    def test_manager_sees_descendant_team_members_too(self, session: Session):
        org = _make_org(session)
        vp_team = _make_team(session, org, "VP Team")
        sub_team = _make_team(session, org, "Sub Team", parent=vp_team)

        vp = _make_user(session, org, UserRole.MANAGER, team=vp_team)
        sub_manager = _make_user(session, org, UserRole.MANAGER, team=sub_team)
        rep = _make_user(session, org, UserRole.MEMBER, team=sub_team)

        visible = get_visible_user_ids(session, vp)
        assert visible == {vp.id, sub_manager.id, rep.id}

    def test_manager_does_not_see_sibling_team(self, session: Session):
        org = _make_org(session)
        root = _make_team(session, org, "Root")
        team_a = _make_team(session, org, "Team A", parent=root)
        team_b = _make_team(session, org, "Team B", parent=root)

        manager_a = _make_user(session, org, UserRole.MANAGER, team=team_a)
        rep_b = _make_user(session, org, UserRole.MEMBER, team=team_b)

        visible = get_visible_user_ids(session, manager_a)
        assert rep_b.id not in visible

    def test_manager_without_team_sees_only_self(self, session: Session):
        org = _make_org(session)
        manager = _make_user(session, org, UserRole.MANAGER, team=None)
        assert get_visible_user_ids(session, manager) == {manager.id}


# ---------------------------------------------------------------------------
# 4. HTTP endpoints
# ---------------------------------------------------------------------------


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123", full_name: str = "Owner") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org_name,
            "full_name": full_name,
            "email": email,
            "password": password,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestAuthEndpoints:
    def test_register_returns_token_and_owner(self, client: TestClient):
        body = _register(client, org_name="Acme Corp", email="owner@acme.io")
        assert body["token_type"] == "bearer"
        assert body["access_token"]
        assert body["user"]["role"] == "owner"
        assert body["user"]["email"] == "owner@acme.io"

    def test_register_duplicate_email_returns_409(self, client: TestClient):
        _register(client, org_name="Acme Corp", email="dup@acme.io")
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Other Corp",
                "full_name": "Someone",
                "email": "dup@acme.io",
                "password": "password123",
            },
        )
        assert resp.status_code == 409

    def test_login_success(self, client: TestClient):
        _register(client, org_name="Acme Corp", email="login@acme.io", password="mypassword1")
        resp = client.post(
            "/api/v1/auth/login", json={"email": "login@acme.io", "password": "mypassword1"}
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    def test_login_wrong_password_returns_401(self, client: TestClient):
        _register(client, org_name="Acme Corp", email="login2@acme.io", password="mypassword1")
        resp = client.post(
            "/api/v1/auth/login", json={"email": "login2@acme.io", "password": "wrong"}
        )
        assert resp.status_code == 401

    def test_me_requires_token(self, client: TestClient):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_login_is_rate_limited(self, client: TestClient):
        """Previously /auth/login had no rate limiting at all — unlimited
        password guesses against any account. See app.core.login_guard."""
        _register(client, org_name="Acme Corp", email="ratelimited@acme.io", password="mypassword1")

        from app.core.config import settings as app_settings
        from app.core.login_guard import reset_login_guard

        original = app_settings.LOGIN_RATE_LIMIT_PER_HOUR
        app_settings.LOGIN_RATE_LIMIT_PER_HOUR = 2
        reset_login_guard()
        try:
            for _ in range(2):
                resp = client.post(
                    "/api/v1/auth/login",
                    json={"email": "ratelimited@acme.io", "password": "wrong-on-purpose"},
                )
                assert resp.status_code == 401  # consumes the quota either way

            limited = client.post(
                "/api/v1/auth/login",
                json={"email": "ratelimited@acme.io", "password": "mypassword1"},  # even the *right* password
            )
            assert limited.status_code == 429
        finally:
            app_settings.LOGIN_RATE_LIMIT_PER_HOUR = original
            reset_login_guard()

    def test_me_returns_current_user(self, client: TestClient):
        body = _register(client, org_name="Acme Corp", email="me@acme.io")
        resp = client.get("/api/v1/auth/me", headers=_auth_headers(body["access_token"]))
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@acme.io"


class TestSignupInviteCode:
    """SIGNUP_INVITE_CODE unset (the default) keeps registration fully open —
    covered by every other test in TestAuthEndpoints, which never sets it."""

    def test_missing_code_rejected_when_configured(self, client: TestClient):
        from app.core.config import settings as app_settings

        with patch.object(app_settings, "SIGNUP_INVITE_CODE", "beta-2026"):
            resp = client.post(
                "/api/v1/auth/register",
                json={
                    "organization_name": "No Code Inc",
                    "full_name": "Someone",
                    "email": "nocode@acme.io",
                    "password": "password123",
                },
            )
        assert resp.status_code == 403

    def test_wrong_code_rejected_when_configured(self, client: TestClient):
        from app.core.config import settings as app_settings

        with patch.object(app_settings, "SIGNUP_INVITE_CODE", "beta-2026"):
            resp = client.post(
                "/api/v1/auth/register",
                json={
                    "organization_name": "Wrong Code Inc",
                    "full_name": "Someone",
                    "email": "wrongcode@acme.io",
                    "password": "password123",
                    "invite_code": "not-it",
                },
            )
        assert resp.status_code == 403

    def test_correct_code_accepted(self, client: TestClient):
        from app.core.config import settings as app_settings

        with patch.object(app_settings, "SIGNUP_INVITE_CODE", "beta-2026"):
            resp = client.post(
                "/api/v1/auth/register",
                json={
                    "organization_name": "Right Code Inc",
                    "full_name": "Someone",
                    "email": "rightcode@acme.io",
                    "password": "password123",
                    "invite_code": "beta-2026",
                },
            )
        assert resp.status_code == 201, resp.text


class TestSignupRateLimit:
    def _register_payload(self, n: int) -> dict:
        return {
            "organization_name": f"RateLimit Org {n}",
            "full_name": "Someone",
            "email": f"ratelimit{n}@acme.io",
            "password": "password123",
        }

    def test_exceeding_limit_returns_429(self, client: TestClient):
        from app.core.config import settings as app_settings
        from app.core.signup_guard import reset_signup_guard

        reset_signup_guard()
        try:
            with patch.object(app_settings, "SIGNUP_RATE_LIMIT_PER_HOUR", 2):
                first = client.post("/api/v1/auth/register", json=self._register_payload(1))
                second = client.post("/api/v1/auth/register", json=self._register_payload(2))
                third = client.post("/api/v1/auth/register", json=self._register_payload(3))
            assert first.status_code == 201, first.text
            assert second.status_code == 201, second.text
            assert third.status_code == 429
        finally:
            reset_signup_guard()

    def test_zero_disables_rate_limit(self, client: TestClient):
        from app.core.config import settings as app_settings
        from app.core.signup_guard import reset_signup_guard

        reset_signup_guard()
        try:
            with patch.object(app_settings, "SIGNUP_RATE_LIMIT_PER_HOUR", 0):
                for n in range(4, 7):
                    resp = client.post("/api/v1/auth/register", json=self._register_payload(n))
                    assert resp.status_code == 201, resp.text
        finally:
            reset_signup_guard()


class TestTeamEndpoints:
    def test_owner_can_create_team(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="teamowner@acme.io")
        resp = client.post(
            "/api/v1/teams", json={"name": "Sales"}, headers=_auth_headers(owner["access_token"])
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["name"] == "Sales"

    def test_member_cannot_create_team(self, client: TestClient, session: Session):
        owner = _register(client, org_name="Acme Corp", email="teamowner2@acme.io")
        org_id = owner["user"]["organization_id"]
        member = _make_user(session, session.get(Organization, uuid.UUID(org_id)), UserRole.MEMBER, email="member@acme.io")
        session.commit()
        token = create_access_token(member.id, organization_id=member.organization_id, role=member.role.value)

        resp = client.post("/api/v1/teams", json={"name": "Sales"}, headers=_auth_headers(token))
        assert resp.status_code == 403

    def test_team_cannot_be_own_parent(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="teamowner3@acme.io")
        headers = _auth_headers(owner["access_token"])
        team = client.post("/api/v1/teams", json={"name": "Sales"}, headers=headers).json()

        resp = client.patch(f"/api/v1/teams/{team['id']}", json={"parent_team_id": team["id"]}, headers=headers)
        assert resp.status_code == 400

    def test_list_teams_scoped_to_organization(self, client: TestClient):
        owner1 = _register(client, org_name="Org One", email="o1@x.io")
        owner2 = _register(client, org_name="Org Two", email="o2@x.io")
        client.post("/api/v1/teams", json={"name": "Org1 Team"}, headers=_auth_headers(owner1["access_token"]))
        client.post("/api/v1/teams", json={"name": "Org2 Team"}, headers=_auth_headers(owner2["access_token"]))

        resp = client.get("/api/v1/teams", headers=_auth_headers(owner1["access_token"]))
        names = [t["name"] for t in resp.json()]
        assert names == ["Org1 Team"]


class TestTeamProfileEndpoints:
    def test_owner_can_set_and_get_team_profile(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="tp-owner1@acme.io")
        headers = _auth_headers(owner["access_token"])
        team = client.post("/api/v1/teams", json={"name": "Franchise Sales"}, headers=headers).json()

        resp = client.put(
            f"/api/v1/teams/{team['id']}/profile",
            json={
                "signal_weights": {"franchise_expansion": 2.0, "funding_round": 0.5},
                "research_focus": "Focus on multi-location retail chains expanding in LATAM.",
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["signal_weights"]["franchise_expansion"] == 2.0
        assert "LATAM" in data["research_focus"]

        get_resp = client.get(f"/api/v1/teams/{team['id']}/profile", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["signal_weights"]["franchise_expansion"] == 2.0

    def test_put_replaces_wholesale(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="tp-owner2@acme.io")
        headers = _auth_headers(owner["access_token"])
        team = client.post("/api/v1/teams", json={"name": "Sales"}, headers=headers).json()

        client.put(
            f"/api/v1/teams/{team['id']}/profile",
            json={"signal_weights": {"hiring": 1.5}, "research_focus": "Original focus"},
            headers=headers,
        )
        resp = client.put(
            f"/api/v1/teams/{team['id']}/profile",
            json={"signal_weights": {}, "research_focus": None},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["signal_weights"] == {}
        assert data["research_focus"] is None

    def test_get_team_profile_not_found(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="tp-owner3@acme.io")
        headers = _auth_headers(owner["access_token"])
        team = client.post("/api/v1/teams", json={"name": "Sales"}, headers=headers).json()

        resp = client.get(f"/api/v1/teams/{team['id']}/profile", headers=headers)
        # "No profile yet" is a team's normal initial state — 200 + null, not
        # a 404 that reads as a failed request in the browser console.
        assert resp.status_code == 200
        assert resp.json() is None

    def test_set_team_profile_rejects_out_of_range_weight(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="tp-owner4@acme.io")
        headers = _auth_headers(owner["access_token"])
        team = client.post("/api/v1/teams", json={"name": "Sales"}, headers=headers).json()

        resp = client.put(
            f"/api/v1/teams/{team['id']}/profile",
            json={"signal_weights": {"hiring": 500.0}},
            headers=headers,
        )
        assert resp.status_code == 422

    def test_member_cannot_set_team_profile(self, client: TestClient, session: Session):
        owner = _register(client, org_name="Acme Corp", email="tp-owner5@acme.io")
        headers = _auth_headers(owner["access_token"])
        team = client.post("/api/v1/teams", json={"name": "Sales"}, headers=headers).json()

        org_id = owner["user"]["organization_id"]
        member = _make_user(session, session.get(Organization, uuid.UUID(org_id)), UserRole.MEMBER, email="tp-member1@acme.io")
        session.commit()
        token = create_access_token(member.id, organization_id=member.organization_id, role=member.role.value)

        resp = client.put(
            f"/api/v1/teams/{team['id']}/profile",
            json={"signal_weights": {}},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 403

    def test_team_profile_cross_org_404(self, client: TestClient):
        owner1 = _register(client, org_name="Org Alpha", email="tp-a@x.io")
        owner2 = _register(client, org_name="Org Beta", email="tp-b@x.io")
        team = client.post(
            "/api/v1/teams", json={"name": "Alpha Team"}, headers=_auth_headers(owner1["access_token"])
        ).json()

        resp = client.put(
            f"/api/v1/teams/{team['id']}/profile",
            json={"signal_weights": {}},
            headers=_auth_headers(owner2["access_token"]),
        )
        assert resp.status_code == 404


class TestUserEndpoints:
    def test_owner_can_create_teammate(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="hire1@acme.io")
        resp = client.post(
            "/api/v1/users",
            json={"email": "newhire@acme.io", "password": "password123", "full_name": "New Hire"},
            headers=_auth_headers(owner["access_token"]),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["role"] == "member"

    def test_cannot_change_owner_role(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="hire2@acme.io")
        headers = _auth_headers(owner["access_token"])
        owner_id = owner["user"]["id"]

        resp = client.patch(f"/api/v1/users/{owner_id}", json={"role": "admin"}, headers=headers)
        assert resp.status_code == 403

    def test_manager_sees_only_subtree_in_user_list(self, client: TestClient, session: Session):
        owner = _register(client, org_name="Acme Corp", email="hire3@acme.io")
        org = session.get(Organization, uuid.UUID(owner["user"]["organization_id"]))

        team_a = _make_team(session, org, "Team A")
        team_b = _make_team(session, org, "Team B")
        manager_a = _make_user(session, org, UserRole.MANAGER, team=team_a, email="mgra@acme.io")
        _make_user(session, org, UserRole.MEMBER, team=team_a, email="repa@acme.io")
        _make_user(session, org, UserRole.MEMBER, team=team_b, email="repb@acme.io")
        session.commit()

        token = create_access_token(manager_a.id, organization_id=org.id, role=manager_a.role.value)
        resp = client.get("/api/v1/users", headers=_auth_headers(token))
        emails = {u["email"] for u in resp.json()}
        assert emails == {"mgra@acme.io", "repa@acme.io"}

    def test_owner_can_remove_teammate(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="remove1@acme.io")
        headers = _auth_headers(owner["access_token"])
        created = client.post(
            "/api/v1/users",
            json={"email": "toremove@acme.io", "password": "password123", "full_name": "Bye"},
            headers=headers,
        ).json()

        resp = client.delete(f"/api/v1/users/{created['id']}", headers=headers)
        assert resp.status_code == 204

        listed = {u["email"]: u for u in client.get("/api/v1/users", headers=headers).json()}
        assert listed["toremove@acme.io"]["is_active"] is False

    def test_removed_teammate_cannot_authenticate(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="remove2@acme.io")
        headers = _auth_headers(owner["access_token"])
        created = client.post(
            "/api/v1/users",
            json={"email": "gone@acme.io", "password": "password123", "full_name": "Gone"},
            headers=headers,
        ).json()
        login = client.post(
            "/api/v1/auth/login", json={"email": "gone@acme.io", "password": "password123"}
        )
        removed_token = login.json()["access_token"]

        client.delete(f"/api/v1/users/{created['id']}", headers=headers)

        # is_active is re-checked on every request (app.api.deps), not just
        # at token issuance — the existing session token stops working
        # immediately rather than at its 7-day expiry.
        resp = client.get("/api/v1/auth/me", headers=_auth_headers(removed_token))
        assert resp.status_code == 401
        # And they can no longer log back in either.
        relogin = client.post(
            "/api/v1/auth/login", json={"email": "gone@acme.io", "password": "password123"}
        )
        assert relogin.status_code == 401

    def test_cannot_remove_owner(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="remove3@acme.io")
        headers = _auth_headers(owner["access_token"])
        resp = client.delete(f"/api/v1/users/{owner['user']['id']}", headers=headers)
        assert resp.status_code == 403

    def test_cannot_remove_self(self, client: TestClient, session: Session):
        owner = _register(client, org_name="Acme Corp", email="remove4@acme.io")
        org = session.get(Organization, uuid.UUID(owner["user"]["organization_id"]))
        admin = _make_user(session, org, UserRole.ADMIN, email="admin-self@acme.io")
        session.commit()
        token = create_access_token(admin.id, organization_id=org.id, role=admin.role.value)

        resp = client.delete(f"/api/v1/users/{admin.id}", headers=_auth_headers(token))
        assert resp.status_code == 403

    def test_member_cannot_remove_teammate(self, client: TestClient, session: Session):
        owner = _register(client, org_name="Acme Corp", email="remove5@acme.io")
        org = session.get(Organization, uuid.UUID(owner["user"]["organization_id"]))
        member = _make_user(session, org, UserRole.MEMBER, email="member-remove@acme.io")
        other = _make_user(session, org, UserRole.MEMBER, email="other-remove@acme.io")
        session.commit()
        token = create_access_token(member.id, organization_id=org.id, role=member.role.value)

        resp = client.delete(f"/api/v1/users/{other.id}", headers=_auth_headers(token))
        assert resp.status_code == 403

    def test_cannot_remove_teammate_from_other_org(self, client: TestClient, session: Session):
        owner_a = _register(client, org_name="Org A", email="removeA@acme.io")
        other_org = _make_org(session)
        outsider = _make_user(session, other_org, UserRole.MEMBER, email="outsider@bcorp.io")
        session.commit()

        resp = client.delete(
            f"/api/v1/users/{outsider.id}", headers=_auth_headers(owner_a["access_token"])
        )
        assert resp.status_code == 404


class TestChangePassword:
    def test_wrong_current_password_rejected(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="pwd1@acme.io")
        resp = client.patch(
            "/api/v1/auth/me/password",
            json={"current_password": "wrongpass", "new_password": "newpassword123"},
            headers=_auth_headers(owner["access_token"]),
        )
        assert resp.status_code == 401

    def test_correct_password_change_and_relogin(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="pwd2@acme.io", password="original123")
        resp = client.patch(
            "/api/v1/auth/me/password",
            json={"current_password": "original123", "new_password": "brandnew123"},
            headers=_auth_headers(owner["access_token"]),
        )
        assert resp.status_code == 204

        old_login = client.post(
            "/api/v1/auth/login", json={"email": "pwd2@acme.io", "password": "original123"}
        )
        assert old_login.status_code == 401

        new_login = client.post(
            "/api/v1/auth/login", json={"email": "pwd2@acme.io", "password": "brandnew123"}
        )
        assert new_login.status_code == 200

    def test_requires_authentication(self, client: TestClient):
        resp = client.patch(
            "/api/v1/auth/me/password",
            json={"current_password": "x", "new_password": "newpassword123"},
        )
        assert resp.status_code == 401


class TestOpportunitiesVisibilityScoping:
    def test_unauthenticated_request_sees_all_ready_opportunities(self, client: TestClient, session: Session):
        org = _make_org(session)
        for i in range(2):
            session.add(Opportunity(
                title=f"Deal {i}", status=OpportunityStatus.READY_TO_ACTION, score=50.0,
                organization_id=org.id,
            ))
        session.commit()

        resp = client.get("/api/v1/opportunities")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_member_only_sees_own_assigned_opportunities(self, client: TestClient, session: Session):
        org = _make_org(session)
        member = _make_user(session, org, UserRole.MEMBER, email="rep@scoped.io")
        other = _make_user(session, org, UserRole.MEMBER, email="other@scoped.io")
        session.add(Opportunity(
            title="Mine", status=OpportunityStatus.READY_TO_ACTION, score=80.0,
            organization_id=org.id, assigned_to_user_id=member.id,
        ))
        session.add(Opportunity(
            title="Not mine", status=OpportunityStatus.READY_TO_ACTION, score=90.0,
            organization_id=org.id, assigned_to_user_id=other.id,
        ))
        session.commit()

        token = create_access_token(member.id, organization_id=org.id, role=member.role.value)
        resp = client.get("/api/v1/opportunities", headers=_auth_headers(token))
        titles = [o["title"] for o in resp.json()]
        assert titles == ["Mine"]

    def test_owner_sees_all_opportunities_when_authenticated(self, client: TestClient, session: Session):
        org = _make_org(session)
        owner = _make_user(session, org, UserRole.OWNER, email="boss@scoped.io")
        member = _make_user(session, org, UserRole.MEMBER, email="rep2@scoped.io")
        session.add(Opportunity(
            title="Someone else's deal", status=OpportunityStatus.READY_TO_ACTION, score=70.0,
            organization_id=org.id, assigned_to_user_id=member.id,
        ))
        session.commit()

        token = create_access_token(owner.id, organization_id=org.id, role=owner.role.value)
        resp = client.get("/api/v1/opportunities", headers=_auth_headers(token))
        assert len(resp.json()) == 1

    def test_member_gets_404_for_battlecard_of_unassigned_opportunity(
        self, client: TestClient, session: Session
    ):
        """A MEMBER hitting another rep's opportunity by id gets 404, not the data."""
        org = _make_org(session)
        member = _make_user(session, org, UserRole.MEMBER, email="rep3@scoped.io")
        other = _make_user(session, org, UserRole.MEMBER, email="rep4@scoped.io")
        opp = Opportunity(
            title="Not yours", status=OpportunityStatus.READY_TO_ACTION, score=70.0,
            organization_id=org.id, assigned_to_user_id=other.id,
            strategy={"pain_point": "x", "closing_argument": "y", "timing_window": {"urgency": "watch", "reason": "z"}},
        )
        session.add(opp)
        session.commit()
        session.refresh(opp)

        token = create_access_token(member.id, organization_id=org.id, role=member.role.value)
        resp = client.get(f"/api/v1/opportunities/{opp.id}/battlecard", headers=_auth_headers(token))
        assert resp.status_code == 404

    def test_owner_can_view_any_opportunity_battlecard(self, client: TestClient, session: Session):
        org = _make_org(session)
        owner = _make_user(session, org, UserRole.OWNER, email="boss2@scoped.io")
        member = _make_user(session, org, UserRole.MEMBER, email="rep5@scoped.io")
        opp = Opportunity(
            title="Someone's deal", status=OpportunityStatus.READY_TO_ACTION, score=70.0,
            organization_id=org.id, assigned_to_user_id=member.id,
            strategy={"pain_point": "x", "closing_argument": "y", "timing_window": {"urgency": "watch", "reason": "z"}},
        )
        session.add(opp)
        session.commit()
        session.refresh(opp)

        token = create_access_token(owner.id, organization_id=org.id, role=owner.role.value)
        resp = client.get(f"/api/v1/opportunities/{opp.id}/battlecard", headers=_auth_headers(token))
        assert resp.status_code == 200


class TestLeadsVisibilityScoping:
    def test_unauthenticated_sees_all_leads(self, client: TestClient, session: Session):
        from app.models.lead import Lead

        org = _make_org(session)
        session.add(Lead(full_name="Jane Doe", organization_id=org.id))
        session.add(Lead(full_name="John Roe", organization_id=org.id))
        session.commit()

        resp = client.get("/api/v1/leads")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_member_only_sees_own_assigned_leads(self, client: TestClient, session: Session):
        from app.models.lead import Lead

        org = _make_org(session)
        member = _make_user(session, org, UserRole.MEMBER, email="leadrep@scoped.io")
        other = _make_user(session, org, UserRole.MEMBER, email="leadother@scoped.io")
        session.add(Lead(full_name="Mine", organization_id=org.id, assigned_to_user_id=member.id))
        session.add(Lead(full_name="Not mine", organization_id=org.id, assigned_to_user_id=other.id))
        session.commit()

        token = create_access_token(member.id, organization_id=org.id, role=member.role.value)
        resp = client.get("/api/v1/leads", headers=_auth_headers(token))
        names = [lead["full_name"] for lead in resp.json()]
        assert names == ["Mine"]

    def test_member_gets_404_for_unassigned_lead_detail(self, client: TestClient, session: Session):
        from app.models.lead import Lead

        org = _make_org(session)
        member = _make_user(session, org, UserRole.MEMBER, email="leadrep2@scoped.io")
        other = _make_user(session, org, UserRole.MEMBER, email="leadother2@scoped.io")
        lead = Lead(full_name="Not yours", organization_id=org.id, assigned_to_user_id=other.id)
        session.add(lead)
        session.commit()
        session.refresh(lead)

        token = create_access_token(member.id, organization_id=org.id, role=member.role.value)
        resp = client.get(f"/api/v1/leads/{lead.id}", headers=_auth_headers(token))
        assert resp.status_code == 404


class TestSignalsOrganizationScoping:
    def test_member_only_sees_own_organization_signals(self, client: TestClient, session: Session):
        from app.models.signal import Signal

        org_a = _make_org(session)
        org_b = _make_org(session)
        member_a = _make_user(session, org_a, UserRole.MEMBER, email="siga@scoped.io")
        session.add(Signal(title="Org A signal", organization_id=org_a.id))
        session.add(Signal(title="Org B signal", organization_id=org_b.id))
        session.commit()

        token = create_access_token(member_a.id, organization_id=org_a.id, role=member_a.role.value)
        resp = client.get("/api/v1/signals", headers=_auth_headers(token))
        titles = [s["title"] for s in resp.json()]
        assert titles == ["Org A signal"]

    def test_untagged_signal_visible_to_everyone(self, client: TestClient, session: Session):
        """A signal with no organization_id (legacy/un-migrated data) stays
        visible to any authenticated user — see Organization's docstring."""
        from app.models.signal import Signal

        org = _make_org(session)
        member = _make_user(session, org, UserRole.MEMBER, email="siglegacy@scoped.io")
        session.add(Signal(title="Legacy signal", organization_id=None))
        session.commit()

        token = create_access_token(member.id, organization_id=org.id, role=member.role.value)
        resp = client.get("/api/v1/signals", headers=_auth_headers(token))
        titles = [s["title"] for s in resp.json()]
        assert "Legacy signal" in titles

    def test_get_signal_from_other_org_returns_404(self, client: TestClient, session: Session):
        from app.models.signal import Signal

        org_a = _make_org(session)
        org_b = _make_org(session)
        member_a = _make_user(session, org_a, UserRole.MEMBER, email="siga2@scoped.io")
        other_signal = Signal(title="Org B signal", organization_id=org_b.id)
        session.add(other_signal)
        session.commit()
        session.refresh(other_signal)

        token = create_access_token(member_a.id, organization_id=org_a.id, role=member_a.role.value)
        resp = client.get(f"/api/v1/signals/{other_signal.id}", headers=_auth_headers(token))
        assert resp.status_code == 404
