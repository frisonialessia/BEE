"""Tests for the organization's own company profile — industry, employee
range, website. Mirrors the ICP endpoint's shape (GET open to any member,
PUT gated to OWNER/ADMIN) — see app.api.v1.endpoints.organizations.
"""

from __future__ import annotations

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


class TestGetOrganizationProfile:
    def test_unset_profile_returns_nulls_not_a_default(self, client: TestClient):
        """A brand-new org has no profile yet — every field must come back
        null, never a fabricated default like '1-10' or 'unknown'."""
        auth = _register(client, org_name="Fresh Co", email="owner@fresh.co")
        resp = client.get("/api/v1/organizations/profile", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        assert resp.json() == {"industry": None, "employee_range": None, "website": None}

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/organizations/profile")
        assert resp.status_code == 401


class TestSetOrganizationProfile:
    def test_owner_can_set_the_full_profile(self, client: TestClient):
        auth = _register(client, org_name="Acme Growth", email="owner@acmegrowth.com")
        headers = _auth_headers(auth["access_token"])

        resp = client.put(
            "/api/v1/organizations/profile",
            headers=headers,
            json={"industry": "B2B SaaS", "employee_range": "11-50", "website": "https://acmegrowth.com"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "industry": "B2B SaaS",
            "employee_range": "11-50",
            "website": "https://acmegrowth.com",
        }

        # Persisted, not just echoed back.
        again = client.get("/api/v1/organizations/profile", headers=headers)
        assert again.json()["employee_range"] == "11-50"

    def test_partial_update_keeps_fields_not_sent(self, client: TestClient):
        """Sending only employee_range must not wipe an industry set
        earlier — see OrganizationProfileIn's docstring for why this is a
        partial patch, not a wholesale replace like ICPCriteriaIn."""
        auth = _register(client, org_name="Partial Co", email="owner@partial.co")
        headers = _auth_headers(auth["access_token"])

        client.put(
            "/api/v1/organizations/profile",
            headers=headers,
            json={"industry": "Fintech"},
        )
        resp = client.put(
            "/api/v1/organizations/profile",
            headers=headers,
            json={"employee_range": "51-200"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"industry": "Fintech", "employee_range": "51-200", "website": None}

    def test_rejects_an_employee_range_outside_the_fixed_set(self, client: TestClient):
        auth = _register(client, org_name="Bad Range Co", email="owner@badrange.co")
        resp = client.put(
            "/api/v1/organizations/profile",
            headers=_auth_headers(auth["access_token"]),
            json={"employee_range": "50000-ish"},
        )
        assert resp.status_code == 422

    def test_member_cannot_set_the_profile(self, client: TestClient):
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
            "/api/v1/organizations/profile",
            headers=member_headers,
            json={"industry": "Should not stick"},
        )
        assert resp.status_code == 403
