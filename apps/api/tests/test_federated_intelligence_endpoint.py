"""Tests for GET/PUT /organizations/federated-intelligence — endpoint
permissions and validation. See test_federated_intelligence.py for the
service-level behavior this toggle controls.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.user import User


def _make_org(session: Session) -> Organization:
    org = Organization(name="Acme Corp", slug=f"acme-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _auth_headers(session: Session, org: Organization, role: UserRole = UserRole.OWNER) -> dict:
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


class TestFederatedIntelligenceEndpoint:
    def test_defaults_to_opted_out(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.MEMBER)
        resp = client.get("/api/v1/organizations/federated-intelligence", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["opt_in"] is False

    def test_owner_can_opt_in(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.OWNER)

        resp = client.put(
            "/api/v1/organizations/federated-intelligence", json={"opt_in": True}, headers=headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["opt_in"] is True

        get_resp = client.get("/api/v1/organizations/federated-intelligence", headers=headers)
        assert get_resp.json()["opt_in"] is True

    def test_owner_can_opt_out_again(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.OWNER)
        client.put("/api/v1/organizations/federated-intelligence", json={"opt_in": True}, headers=headers)

        resp = client.put(
            "/api/v1/organizations/federated-intelligence", json={"opt_in": False}, headers=headers
        )
        assert resp.status_code == 200
        assert resp.json()["opt_in"] is False

    def test_admin_cannot_opt_in(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.ADMIN)
        resp = client.put(
            "/api/v1/organizations/federated-intelligence", json={"opt_in": True}, headers=headers
        )
        assert resp.status_code == 403

    def test_unauthenticated_request_rejected(self, client: TestClient) -> None:
        resp = client.get("/api/v1/organizations/federated-intelligence")
        assert resp.status_code == 401
