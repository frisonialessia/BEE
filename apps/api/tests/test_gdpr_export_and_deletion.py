"""Tests for GET /organizations/me/export and the deletion-request flow
(POST/DELETE /organizations/me/deletion-request) — see
app.api.v1.endpoints.organizations's module docstring for why the
deletion-request endpoint records a request rather than deleting anything.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token
from app.models.base import UserRole
from app.models.company import Company
from app.models.lead import Lead
from app.models.user import User


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestOrganizationDataExport:
    def test_member_cannot_export(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Export Locked Co", email="owner@exportlocked.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        member = User(
            organization_id=org_id, email="member@exportlocked.co", hashed_password="x",
            full_name="Member", role=UserRole.MEMBER,
        )
        session.add(member)
        session.commit()
        token = create_access_token(member.id, organization_id=org_id, role=member.role.value)

        resp = client.get("/api/v1/organizations/me/export", headers=_auth_headers(token))
        assert resp.status_code == 403

    def test_owner_export_includes_own_org_data_only(self, client: TestClient, session: Session):
        auth_a = _register(client, org_name="Export Org A", email="owner@exportorga.co")
        auth_b = _register(client, org_name="Export Org B", email="owner@exportorgb.co")
        org_a_id = uuid.UUID(auth_a["user"]["organization_id"])
        org_b_id = uuid.UUID(auth_b["user"]["organization_id"])

        session.add(Company(name="A Co", organization_id=org_a_id))
        session.add(Company(name="B Co", organization_id=org_b_id))
        session.add(Lead(full_name="A Lead", organization_id=org_a_id))
        session.commit()

        resp = client.get("/api/v1/organizations/me/export", headers=_auth_headers(auth_a["access_token"]))
        assert resp.status_code == 200
        body = resp.json()
        assert body["organization_id"] == str(org_a_id)
        company_names = [c["name"] for c in body["companies"]]
        assert "A Co" in company_names
        assert "B Co" not in company_names
        assert any(u["email"] == "owner@exportorga.co" for u in body["users"])
        assert body["truncated"] == []


class TestDeletionRequestFlow:
    def test_wrong_confirmation_name_is_rejected(self, client: TestClient):
        auth = _register(client, org_name="Deletion Confirm Co", email="owner@deletionconfirm.co")
        resp = client.post(
            "/api/v1/organizations/me/deletion-request",
            headers=_auth_headers(auth["access_token"]),
            json={"confirm_organization_name": "Wrong Name"},
        )
        assert resp.status_code == 422

    def test_admin_cannot_request_deletion_only_owner(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Owner Only Co", email="owner@owneronly.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        admin = User(
            organization_id=org_id, email="admin@owneronly.co", hashed_password="x",
            full_name="Admin", role=UserRole.ADMIN,
        )
        session.add(admin)
        session.commit()
        token = create_access_token(admin.id, organization_id=org_id, role=admin.role.value)

        resp = client.post(
            "/api/v1/organizations/me/deletion-request",
            headers=_auth_headers(token),
            json={"confirm_organization_name": "Owner Only Co"},
        )
        assert resp.status_code == 403

    def test_correct_confirmation_records_the_request_and_nothing_is_deleted(
        self, client: TestClient, session: Session
    ):
        auth = _register(client, org_name="Real Deletion Request Co", email="owner@realdeletion.co")
        headers = _auth_headers(auth["access_token"])
        org_id = uuid.UUID(auth["user"]["organization_id"])
        session.add(Company(name="Still Here Co", organization_id=org_id))
        session.commit()

        resp = client.post(
            "/api/v1/organizations/me/deletion-request",
            headers=headers,
            json={"confirm_organization_name": "Real Deletion Request Co"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["requested"] is True
        assert body["requested_at"] is not None
        assert body["requested_by_user_id"] == auth["user"]["id"]

        # Nothing was actually deleted — this only recorded the request.
        export = client.get("/api/v1/organizations/me/export", headers=headers).json()
        assert any(c["name"] == "Still Here Co" for c in export["companies"])

        audit = client.get(
            "/api/v1/audit/admin", headers=headers, params={"action": "organization.deletion_requested"}
        ).json()
        assert len(audit) == 1

    def test_cancel_without_a_pending_request_is_404(self, client: TestClient):
        auth = _register(client, org_name="No Pending Deletion Co", email="owner@nopendingdeletion.co")
        resp = client.delete(
            "/api/v1/organizations/me/deletion-request", headers=_auth_headers(auth["access_token"])
        )
        assert resp.status_code == 404

    def test_cancel_clears_the_request(self, client: TestClient):
        auth = _register(client, org_name="Cancel Deletion Co", email="owner@canceldeletion.co")
        headers = _auth_headers(auth["access_token"])
        client.post(
            "/api/v1/organizations/me/deletion-request",
            headers=headers,
            json={"confirm_organization_name": "Cancel Deletion Co"},
        )

        resp = client.delete("/api/v1/organizations/me/deletion-request", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["requested"] is False

        # Cancelling again now 404s — there's nothing pending anymore.
        resp2 = client.delete("/api/v1/organizations/me/deletion-request", headers=headers)
        assert resp2.status_code == 404
