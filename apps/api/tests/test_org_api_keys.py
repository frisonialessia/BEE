"""Tests for OrganizationApiKey — per-tenant webhook ingestion auth.

Covers:
1. Key generation/hashing (core.security)
2. HTTP endpoints — create/list/revoke, role-gated to OWNER/ADMIN
3. Org-scoped signal ingestion via X-BEE-Org-Key on POST /signals/webhook
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, generate_api_key, hash_api_key
from app.models.base import UserRole
from app.models.company import Company
from app.models.organization import Organization
from app.models.organization_api_key import OrganizationApiKey
from app.models.user import User

# ---------------------------------------------------------------------------
# 1. Key generation
# ---------------------------------------------------------------------------


class TestGenerateApiKey:
    def test_plaintext_is_not_the_stored_hash(self):
        plaintext, key_hash = generate_api_key()
        assert plaintext != key_hash
        assert plaintext.startswith("bee_org_")

    def test_hash_is_deterministic_and_matches_plaintext(self):
        plaintext, key_hash = generate_api_key()
        assert hash_api_key(plaintext) == key_hash

    def test_two_generated_keys_differ(self):
        plaintext1, _ = generate_api_key()
        plaintext2, _ = generate_api_key()
        assert plaintext1 != plaintext2


# ---------------------------------------------------------------------------
# Shared helpers (mirrors tests/test_auth_multitenancy.py conventions)
# ---------------------------------------------------------------------------


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org_name,
            "full_name": "Owner",
            "email": email,
            "password": password,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_org(session: Session, name: str = "Org") -> Organization:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_active_key(session: Session, org: Organization, name: str = "Integration") -> str:
    """Create an active key directly via the DB and return its plaintext."""
    plaintext, key_hash = generate_api_key()
    session.add(
        OrganizationApiKey(organization_id=org.id, name=name, key_prefix=plaintext[:12], key_hash=key_hash)
    )
    session.commit()
    return plaintext


# ---------------------------------------------------------------------------
# 2. HTTP endpoints
# ---------------------------------------------------------------------------


class TestApiKeyEndpoints:
    def test_owner_can_create_key_and_sees_plaintext_once(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="keyowner@acme.io")
        resp = client.post(
            "/api/v1/organizations/api-keys",
            json={"name": "Zapier"},
            headers=_auth_headers(owner["access_token"]),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["name"] == "Zapier"
        assert body["api_key"].startswith("bee_org_")
        assert body["key_prefix"] == body["api_key"][:12]

    def test_member_cannot_create_key(self, client: TestClient, session: Session):
        owner = _register(client, org_name="Acme Corp", email="keyowner2@acme.io")
        org_id = uuid.UUID(owner["user"]["organization_id"])
        member = User(
            organization_id=org_id,
            email="keymember@acme.io",
            hashed_password="x",
            full_name="Member",
            role=UserRole.MEMBER,
        )
        session.add(member)
        session.commit()

        token = create_access_token(member.id, organization_id=org_id, role=member.role.value)

        resp = client.post(
            "/api/v1/organizations/api-keys", json={"name": "Nope"}, headers=_auth_headers(token)
        )
        assert resp.status_code == 403

    def test_list_keys_never_returns_plaintext(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="keyowner3@acme.io")
        headers = _auth_headers(owner["access_token"])
        client.post("/api/v1/organizations/api-keys", json={"name": "K1"}, headers=headers)

        resp = client.get("/api/v1/organizations/api-keys", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert "api_key" not in body[0]
        assert body[0]["key_prefix"].startswith("bee_org_")

    def test_list_keys_scoped_to_organization(self, client: TestClient):
        owner1 = _register(client, org_name="Org One", email="k1@x.io")
        owner2 = _register(client, org_name="Org Two", email="k2@x.io")
        client.post(
            "/api/v1/organizations/api-keys",
            json={"name": "Org1 Key"},
            headers=_auth_headers(owner1["access_token"]),
        )

        resp = client.get("/api/v1/organizations/api-keys", headers=_auth_headers(owner2["access_token"]))
        assert resp.json() == []

    def test_revoke_key_deactivates_it(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="keyowner4@acme.io")
        headers = _auth_headers(owner["access_token"])
        created = client.post("/api/v1/organizations/api-keys", json={"name": "K1"}, headers=headers).json()

        resp = client.delete(f"/api/v1/organizations/api-keys/{created['id']}", headers=headers)
        assert resp.status_code == 204

        listed = client.get("/api/v1/organizations/api-keys", headers=headers).json()
        assert listed[0]["is_active"] is False

    def test_revoke_key_from_other_org_returns_404(self, client: TestClient):
        owner1 = _register(client, org_name="Org One", email="k3@x.io")
        owner2 = _register(client, org_name="Org Two", email="k4@x.io")
        created = client.post(
            "/api/v1/organizations/api-keys",
            json={"name": "Org1 Key"},
            headers=_auth_headers(owner1["access_token"]),
        ).json()

        resp = client.delete(
            f"/api/v1/organizations/api-keys/{created['id']}", headers=_auth_headers(owner2["access_token"])
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 3. Org-scoped signal ingestion
# ---------------------------------------------------------------------------


class TestOrgScopedWebhookIngestion:
    def test_webhook_without_org_key_stays_untagged(self, client: TestClient):
        """Backward compatibility: no X-BEE-Org-Key -> everything created stays
        untagged, same as before organization API keys existed."""
        resp = client.post(
            "/api/v1/signals/webhook",
            json={
                "title": "No org signal",
                "event": "funding.round.announced",
                "company": {"name": "NoOrgCo", "domain": "noorgco.com"},
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["signal"]["id"]

    def test_webhook_with_org_key_tags_created_records(self, client: TestClient, session: Session):
        org = _make_org(session, "Tagged Org")
        plaintext = _make_active_key(session, org)

        resp = client.post(
            "/api/v1/signals/webhook",
            json={
                "title": "Tagged signal",
                "event": "funding.round.announced",
                "company": {"name": "TaggedCo", "domain": "taggedco.com"},
            },
            headers={"X-BEE-Org-Key": plaintext},
        )
        assert resp.status_code == 201, resp.text

        company = session.exec(
            select(Company).where(Company.domain == "taggedco.com")
        ).first()
        assert company is not None
        assert company.organization_id == org.id

    def test_webhook_with_invalid_org_key_returns_401(self, client: TestClient):
        resp = client.post(
            "/api/v1/signals/webhook",
            json={"title": "X", "event": "funding.round.announced"},
            headers={"X-BEE-Org-Key": "bee_org_totally-not-a-real-key"},
        )
        assert resp.status_code == 401

    def test_webhook_with_revoked_org_key_returns_401(self, client: TestClient, session: Session):
        org = _make_org(session, "Revoked Org")
        plaintext, key_hash = generate_api_key()
        key = OrganizationApiKey(
            organization_id=org.id, name="Revoked", key_prefix=plaintext[:12], key_hash=key_hash, is_active=False
        )
        session.add(key)
        session.commit()

        resp = client.post(
            "/api/v1/signals/webhook",
            json={"title": "X", "event": "funding.round.announced"},
            headers={"X-BEE-Org-Key": plaintext},
        )
        assert resp.status_code == 401

    def test_two_orgs_same_domain_get_separate_company_rows(self, client: TestClient, session: Session):
        """Company.domain uniqueness is per-org (uq_companies_org_domain) — two
        organizations tracking the same company each get their own row."""
        org_a = _make_org(session, "Org A")
        org_b = _make_org(session, "Org B")
        key_a = _make_active_key(session, org_a, "A key")
        key_b = _make_active_key(session, org_b, "B key")

        for key in (key_a, key_b):
            resp = client.post(
                "/api/v1/signals/webhook",
                json={
                    "title": "Shared domain signal",
                    "event": "funding.round.announced",
                    "company": {"name": "SharedCo", "domain": "sharedco.com"},
                },
                headers={"X-BEE-Org-Key": key},
            )
            assert resp.status_code == 201, resp.text

        companies = session.exec(
            select(Company).where(Company.domain == "sharedco.com")
        ).all()
        assert len(companies) == 2
        assert {c.organization_id for c in companies} == {org_a.id, org_b.id}
