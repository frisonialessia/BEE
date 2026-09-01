"""Tests for the organization's Ideal Customer Profile criteria — see
app.api.v1.endpoints.organizations (GET open to any member, PUT gated to
OWNER/ADMIN, same pattern as test_organization_profile.py).
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


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


EMPTY_ICP = {
    "industries": [],
    "sizes": [],
    "countries": [],
    "revenue_ranges": [],
    "job_titles": [],
    "seniorities": [],
    "tech_keywords": [],
}


class TestGetIcpCriteria:
    def test_unset_icp_returns_empty_lists_not_a_default(self, client: TestClient):
        """A brand-new org has no ICP configured — every dimension must come
        back an empty list, never a fabricated one. Empty means "no
        opinion", not "nothing matches" — see ICPCriteriaIn's docstring."""
        auth = _register(client, org_name="Fresh Co", email="owner@fresh.co")
        resp = client.get("/api/v1/organizations/icp", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        assert resp.json() == EMPTY_ICP

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/organizations/icp")
        assert resp.status_code == 401

    def test_reads_an_old_three_field_criteria_blob_with_defaults_for_the_rest(
        self, client: TestClient, session
    ):
        """A pre-existing org whose icp_criteria JSON predates the
        buyer-persona fields (only industries/sizes/countries ever written)
        must still GET cleanly — the new dimensions default to empty
        instead of a KeyError or a 500."""
        auth = _register(client, org_name="Legacy Co", email="owner@legacy.co")
        from app.models.user import User

        user = session.get(User, uuid.UUID(auth["user"]["id"]))
        user.organization.icp_criteria = {
            "industries": ["Fintech"],
            "sizes": ["11-50"],
            "countries": ["Mexico"],
        }
        session.add(user.organization)
        session.commit()

        resp = client.get("/api/v1/organizations/icp", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        assert resp.json() == {
            "industries": ["Fintech"],
            "sizes": ["11-50"],
            "countries": ["Mexico"],
            "revenue_ranges": [],
            "job_titles": [],
            "seniorities": [],
            "tech_keywords": [],
        }


class TestSetIcpCriteria:
    def test_owner_can_set_the_full_buyer_persona(self, client: TestClient):
        auth = _register(client, org_name="Acme Growth", email="owner@acmegrowth.com")
        headers = _auth_headers(auth["access_token"])

        payload = {
            "industries": ["B2B SaaS", "Fintech"],
            "sizes": ["11-50", "51-200"],
            "countries": ["Mexico", "Colombia"],
            "revenue_ranges": ["$1M-$10M", "$10M-$50M"],
            "job_titles": ["VP Sales", "Head of Revenue"],
            "seniorities": ["vp", "c_level"],
            "tech_keywords": ["Salesforce", "HubSpot"],
        }
        resp = client.put("/api/v1/organizations/icp", headers=headers, json=payload)
        assert resp.status_code == 200, resp.text
        assert resp.json() == payload

        # Persisted, not just echoed back.
        again = client.get("/api/v1/organizations/icp", headers=headers)
        assert again.json() == payload

    def test_put_replaces_wholesale_a_field_left_out_is_wiped(self, client: TestClient):
        """Unlike the org profile endpoint, ICP is a wholesale replace — a
        second PUT that omits job_titles must clear it, not keep the old
        value (see ICPCriteriaIn's docstring)."""
        auth = _register(client, org_name="Replace Co", email="owner@replace.co")
        headers = _auth_headers(auth["access_token"])

        client.put(
            "/api/v1/organizations/icp",
            headers=headers,
            json={**EMPTY_ICP, "job_titles": ["CTO"]},
        )
        resp = client.put("/api/v1/organizations/icp", headers=headers, json=EMPTY_ICP)
        assert resp.status_code == 200
        assert resp.json()["job_titles"] == []

    def test_rejects_more_than_fifty_values_in_a_new_dimension(self, client: TestClient):
        auth = _register(client, org_name="Too Many Co", email="owner@toomany.co")
        resp = client.put(
            "/api/v1/organizations/icp",
            headers=_auth_headers(auth["access_token"]),
            json={**EMPTY_ICP, "seniorities": [f"tier-{i}" for i in range(51)]},
        )
        assert resp.status_code == 422

    def test_member_cannot_set_the_icp(self, client: TestClient):
        auth = _register(client, org_name="Locked Co", email="owner@locked.co")
        owner_headers = _auth_headers(auth["access_token"])

        created = client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={
                "email": "member@locked.co",
                "full_name": "A Member",
                "password": "password123",
                "role": "member",
            },
        )
        assert created.status_code == 201, created.text

        login = client.post(
            "/api/v1/auth/login", json={"email": "member@locked.co", "password": "password123"}
        )
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.put(
            "/api/v1/organizations/icp",
            headers=member_headers,
            json={**EMPTY_ICP, "job_titles": ["Should not stick"]},
        )
        assert resp.status_code == 403

        # Member can still read it, though.
        resp = client.get("/api/v1/organizations/icp", headers=member_headers)
        assert resp.status_code == 200


class TestCompanyRevenueRange:
    def test_create_company_accepts_revenue_range(self, client: TestClient):
        auth = _register(client, org_name="Revenue Co", email="owner@revenueco.com")
        resp = client.post(
            "/api/v1/companies",
            headers=_auth_headers(auth["access_token"]),
            json={"name": "Prospect Inc", "revenue_range": "$10M-$50M"},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["revenue_range"] == "$10M-$50M"

    def test_create_company_without_revenue_range_leaves_it_null(self, client: TestClient):
        auth = _register(client, org_name="No Revenue Co", email="owner@norevenue.com")
        resp = client.post(
            "/api/v1/companies",
            headers=_auth_headers(auth["access_token"]),
            json={"name": "Unknown Size Inc"},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["revenue_range"] is None
