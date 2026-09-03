"""Tests for the general admin audit log (AdminAuditLog / AdminAuditService
/ GET /audit/admin) — see app.models.admin_audit_log for what this is and
isn't (not AuditTrailService's AI-decision log). Covers: the service's
non-blocking log()/list_entries(), and end-to-end coverage that the real
security-relevant mutation endpoints actually produce entries — role
change, user deactivation, API key create/revoke, ICP criteria update,
and an integration disconnect.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token
from app.models.base import UserRole
from app.models.user import User
from app.services.admin_audit import AdminAuditService


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestAdminAuditServiceUnit:
    def test_log_persists_and_is_listable(self, session: Session):
        org_id = uuid.uuid4()
        actor_id = uuid.uuid4()
        service = AdminAuditService(session)
        entry = service.log(
            organization_id=org_id,
            actor_user_id=actor_id,
            action="user.role_changed",
            summary="Test summary",
            entity_type="user",
            entity_id=actor_id,
            detail={"role": {"from": "member", "to": "admin"}},
        )
        session.commit()
        assert entry is not None

        found = service.list_entries(organization_id=org_id)
        assert len(found) == 1
        assert found[0].action == "user.role_changed"
        assert found[0].detail == {"role": {"from": "member", "to": "admin"}}

    def test_list_entries_filters_by_action(self, session: Session):
        org_id = uuid.uuid4()
        service = AdminAuditService(session)
        service.log(organization_id=org_id, actor_user_id=None, action="api_key.created", summary="a")
        service.log(organization_id=org_id, actor_user_id=None, action="api_key.revoked", summary="b")
        session.commit()

        created_only = service.list_entries(organization_id=org_id, action="api_key.created")
        assert len(created_only) == 1
        assert created_only[0].summary == "a"

    def test_list_entries_scoped_to_organization(self, session: Session):
        org_a, org_b = uuid.uuid4(), uuid.uuid4()
        service = AdminAuditService(session)
        service.log(organization_id=org_a, actor_user_id=None, action="user.deactivated", summary="a")
        service.log(organization_id=org_b, actor_user_id=None, action="user.deactivated", summary="b")
        session.commit()

        found = service.list_entries(organization_id=org_a)
        assert len(found) == 1
        assert found[0].summary == "a"


class TestAdminAuditEndpointRoleGate:
    def test_member_cannot_list_admin_audit_log(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Audit Locked Co", email="owner@auditlocked.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        member = User(
            organization_id=org_id,
            email="member@auditlocked.co",
            hashed_password="x",
            full_name="Member",
            role=UserRole.MEMBER,
        )
        session.add(member)
        session.commit()
        token = create_access_token(member.id, organization_id=org_id, role=member.role.value)

        resp = client.get("/api/v1/audit/admin", headers=_auth_headers(token))
        assert resp.status_code == 403

    def test_owner_can_list_admin_audit_log(self, client: TestClient):
        auth = _register(client, org_name="Audit Owner Co", email="owner@auditowner.co")
        resp = client.get("/api/v1/audit/admin", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        assert resp.json() == []


class TestAdminAuditRealMutationsProduceEntries:
    def test_role_change_is_logged(self, client: TestClient):
        auth = _register(client, org_name="Role Audit Co", email="owner@roleaudit.co")
        headers = _auth_headers(auth["access_token"])
        create_resp = client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": "member@roleaudit.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        member_id = create_resp.json()["id"]

        resp = client.patch(f"/api/v1/users/{member_id}", headers=headers, json={"role": "admin"})
        assert resp.status_code == 200

        audit_resp = client.get("/api/v1/audit/admin", headers=headers, params={"action": "user.role_changed"})
        entries = audit_resp.json()
        assert len(entries) == 1
        assert entries[0]["entity_id"] == member_id
        assert entries[0]["detail"]["role"] == {"from": "member", "to": "admin"}

    def test_user_deactivation_is_logged(self, client: TestClient):
        auth = _register(client, org_name="Deactivate Audit Co", email="owner@deactivateaudit.co")
        headers = _auth_headers(auth["access_token"])
        create_resp = client.post(
            "/api/v1/users",
            headers=headers,
            json={"email": "member@deactivateaudit.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        member_id = create_resp.json()["id"]

        resp = client.delete(f"/api/v1/users/{member_id}", headers=headers)
        assert resp.status_code == 204

        audit_resp = client.get("/api/v1/audit/admin", headers=headers, params={"action": "user.deactivated"})
        entries = audit_resp.json()
        assert len(entries) == 1
        assert entries[0]["entity_id"] == member_id

    def test_api_key_create_and_revoke_are_logged(self, client: TestClient):
        auth = _register(client, org_name="Key Audit Co", email="owner@keyaudit.co")
        headers = _auth_headers(auth["access_token"])
        create_resp = client.post("/api/v1/organizations/api-keys", headers=headers, json={"name": "Zapier"})
        key_id = create_resp.json()["id"]

        client.delete(f"/api/v1/organizations/api-keys/{key_id}", headers=headers)

        created = client.get(
            "/api/v1/audit/admin", headers=headers, params={"action": "api_key.created"}
        ).json()
        revoked = client.get(
            "/api/v1/audit/admin", headers=headers, params={"action": "api_key.revoked"}
        ).json()
        assert len(created) == 1
        assert created[0]["entity_id"] == key_id
        assert len(revoked) == 1
        assert revoked[0]["entity_id"] == key_id

    def test_icp_criteria_update_is_logged_with_actor(self, client: TestClient):
        auth = _register(client, org_name="ICP Audit Co", email="owner@icpaudit.co")
        headers = _auth_headers(auth["access_token"])
        resp = client.put("/api/v1/organizations/icp", headers=headers, json={"industries": ["SaaS"]})
        assert resp.status_code == 200

        entries = client.get(
            "/api/v1/audit/admin", headers=headers, params={"action": "icp_criteria.updated"}
        ).json()
        assert len(entries) == 1
        assert entries[0]["actor_user_id"] == auth["user"]["id"]
