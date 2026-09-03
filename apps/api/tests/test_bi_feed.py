"""Tests for the BI data feed (GET /api/v1/bi/{companies,leads,opportunities})
— see app.api.v1.endpoints.bi_feed's module docstring for the full
rationale. Covers: auth (org API key required, header or query param, no
untagged fallback), tenant isolation, and pagination.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import generate_api_key
from app.models.company import Company
from app.models.organization import Organization
from app.models.organization_api_key import OrganizationApiKey


def _make_org(session: Session, name: str = "Org") -> Organization:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_active_key(session: Session, org: Organization, name: str = "BI") -> str:
    plaintext, key_hash = generate_api_key()
    session.add(OrganizationApiKey(organization_id=org.id, name=name, key_prefix=plaintext[:12], key_hash=key_hash))
    session.commit()
    return plaintext


class TestBiFeedAuth:
    def test_no_key_returns_401(self, client: TestClient):
        resp = client.get("/api/v1/bi/companies")
        assert resp.status_code == 401

    def test_invalid_key_returns_401(self, client: TestClient):
        resp = client.get("/api/v1/bi/companies", headers={"X-BEE-Org-Key": "not-a-real-key"})
        assert resp.status_code == 401

    def test_key_as_header_works(self, client: TestClient, session: Session):
        org = _make_org(session, "Header Org")
        key = _make_active_key(session, org)
        resp = client.get("/api/v1/bi/companies", headers={"X-BEE-Org-Key": key})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_key_as_query_param_works(self, client: TestClient, session: Session):
        """The whole point of accepting ?org_key= — Power BI's Web connector
        pastes a bare URL, no custom-headers setup required."""
        org = _make_org(session, "QueryParam Org")
        key = _make_active_key(session, org)
        resp = client.get(f"/api/v1/bi/companies?org_key={key}")
        assert resp.status_code == 200


class TestBiFeedTenantIsolation:
    def test_only_returns_this_orgs_companies(self, session: Session, client: TestClient):
        org_a = _make_org(session, "Org A")
        org_b = _make_org(session, "Org B")
        key_a = _make_active_key(session, org_a)

        session.add(Company(name="A Co", organization_id=org_a.id))
        session.add(Company(name="B Co", organization_id=org_b.id))
        session.commit()

        resp = client.get("/api/v1/bi/companies", headers={"X-BEE-Org-Key": key_a})
        assert resp.status_code == 200
        names = [c["name"] for c in resp.json()]
        assert "A Co" in names
        assert "B Co" not in names


class TestBiFeedPagination:
    def test_limit_and_offset_are_respected(self, session: Session, client: TestClient):
        org = _make_org(session, "Paged Org")
        key = _make_active_key(session, org)
        for i in range(5):
            session.add(Company(name=f"Co {i}", organization_id=org.id))
        session.commit()

        resp = client.get("/api/v1/bi/companies", headers={"X-BEE-Org-Key": key}, params={"limit": 2, "offset": 0})
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_limit_above_the_cap_is_rejected(self, session: Session, client: TestClient):
        org = _make_org(session, "Cap Org")
        key = _make_active_key(session, org)
        resp = client.get("/api/v1/bi/companies", headers={"X-BEE-Org-Key": key}, params={"limit": 5000})
        assert resp.status_code == 422


class TestBiFeedEndpoints:
    def test_leads_feed_requires_a_key_too(self, client: TestClient):
        assert client.get("/api/v1/bi/leads").status_code == 401

    def test_opportunities_feed_requires_a_key_too(self, client: TestClient):
        assert client.get("/api/v1/bi/opportunities").status_code == 401

    def test_leads_and_opportunities_feeds_work_when_empty(self, session: Session, client: TestClient):
        org = _make_org(session, "Empty Feeds Org")
        key = _make_active_key(session, org)
        headers = {"X-BEE-Org-Key": key}
        assert client.get("/api/v1/bi/leads", headers=headers).json() == []
        assert client.get("/api/v1/bi/opportunities", headers=headers).json() == []
