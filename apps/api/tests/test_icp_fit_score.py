"""Tests for server-persisted Company.fit_score — the backend port of the
frontend's lib/icp.ts (see app.services.icp.fit_score), and the event
listeners that keep it in sync with company edits and ICP criteria
changes (see app/services/events/listeners.py).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.models.company import Company
from app.models.lead import Lead
from app.services.icp.fit_score import compute_fit_score, is_icp_configured

EMPTY_CRITERIA = {
    "industries": [],
    "sizes": [],
    "countries": [],
    "revenue_ranges": [],
    "job_titles": [],
    "seniorities": [],
    "tech_keywords": [],
}


def _register(client: TestClient, *, org_name: str, email: str) -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestComputeFitScorePure:
    """No DB, no HTTP — just the algorithm."""

    def test_unconfigured_icp_returns_none(self):
        company = Company(name="Acme")
        assert compute_fit_score(company, EMPTY_CRITERIA, company_leads=[], company_tech_signals=[]) is None
        assert is_icp_configured(EMPTY_CRITERIA) is False

    def test_full_match_on_the_only_configured_dimension_is_100(self):
        company = Company(name="Acme", industry="B2B SaaS")
        criteria = {**EMPTY_CRITERIA, "industries": ["B2B SaaS", "Fintech"]}
        assert compute_fit_score(company, criteria, company_leads=[], company_tech_signals=[]) == 100

    def test_miss_on_the_only_configured_dimension_is_0(self):
        company = Company(name="Acme", industry="Retail")
        criteria = {**EMPTY_CRITERIA, "industries": ["B2B SaaS"]}
        assert compute_fit_score(company, criteria, company_leads=[], company_tech_signals=[]) == 0

    def test_unconfigured_dimensions_dont_count_for_or_against(self):
        """Only industry is configured — company.country being unset (or
        anything else) must not drag the score down; the score should be
        computed purely from the 1 configured dimension."""
        company = Company(name="Acme", industry="B2B SaaS", country=None)
        criteria = {**EMPTY_CRITERIA, "industries": ["B2B SaaS"]}
        assert compute_fit_score(company, criteria, company_leads=[], company_tech_signals=[]) == 100

    def test_two_of_three_dimensions_match_is_67(self):
        company = Company(name="Acme", industry="B2B SaaS", size="11-50", country="Chile")
        criteria = {**EMPTY_CRITERIA, "industries": ["B2B SaaS"], "sizes": ["11-50"], "countries": ["Mexico"]}
        assert compute_fit_score(company, criteria, company_leads=[], company_tech_signals=[]) == 67

    def test_job_title_match_is_case_insensitive_substring(self):
        company = Company(name="Acme")
        criteria = {**EMPTY_CRITERIA, "job_titles": ["vp sales"]}

        exact_case_mismatch = Lead(full_name="Jane Doe", title="VP Sales")
        assert compute_fit_score(company, criteria, company_leads=[exact_case_mismatch], company_tech_signals=[]) == 100

        # "vp sales" is not a substring of "vp of sales & growth" — this
        # should NOT match; a looser fuzzy match isn't what the frontend
        # algorithm does, and porting a stricter/looser variant would be a
        # silent behavior drift from lib/icp.ts.
        not_a_substring = Lead(full_name="Jane Doe", title="VP of Sales & Growth")
        assert compute_fit_score(company, criteria, company_leads=[not_a_substring], company_tech_signals=[]) == 0


class TestFitScoreEndToEnd:
    def test_new_company_gets_scored_immediately_if_icp_already_configured(self, client: TestClient):
        auth = _register(client, org_name="Acme Fit", email="owner@acmefit.com")
        headers = _auth_headers(auth["access_token"])
        client.put(
            "/api/v1/organizations/icp",
            headers=headers,
            json={**EMPTY_CRITERIA, "industries": ["B2B SaaS"]},
        )

        resp = client.post(
            "/api/v1/companies",
            headers=headers,
            json={"name": "Nimbus Cloud", "industry": "B2B SaaS"},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["fit_score"] == 100

    def test_company_created_before_icp_is_none_until_icp_is_set(self, client: TestClient):
        auth = _register(client, org_name="Acme Fit Order", email="owner@acmefitorder.com")
        headers = _auth_headers(auth["access_token"])

        resp = client.post(
            "/api/v1/companies", headers=headers, json={"name": "Nimbus Cloud", "industry": "B2B SaaS"}
        )
        assert resp.json()["fit_score"] is None

    def test_editing_industry_recomputes_fit_score(self, client: TestClient):
        auth = _register(client, org_name="Acme Fit Edit", email="owner@acmefitedit.com")
        headers = _auth_headers(auth["access_token"])
        client.put(
            "/api/v1/organizations/icp", headers=headers, json={**EMPTY_CRITERIA, "industries": ["Fintech"]}
        )
        create = client.post("/api/v1/companies", headers=headers, json={"name": "Nimbus", "industry": "Retail"})
        company_id = create.json()["id"]
        assert create.json()["fit_score"] == 0

        patch = client.patch(f"/api/v1/companies/{company_id}", headers=headers, json={"industry": "Fintech"})
        assert patch.status_code == 200, patch.text
        assert patch.json()["fit_score"] == 100

    def test_editing_a_field_that_doesnt_feed_fit_score_leaves_it_unchanged(self, client: TestClient):
        """description/website/name aren't ICP dimensions — editing them
        shouldn't trigger (or need) a recompute at all."""
        auth = _register(client, org_name="Acme Fit Noop", email="owner@acmefitnoop.com")
        headers = _auth_headers(auth["access_token"])
        client.put(
            "/api/v1/organizations/icp", headers=headers, json={**EMPTY_CRITERIA, "industries": ["Fintech"]}
        )
        create = client.post("/api/v1/companies", headers=headers, json={"name": "Nimbus", "industry": "Fintech"})
        company_id = create.json()["id"]
        assert create.json()["fit_score"] == 100

        patch = client.patch(
            f"/api/v1/companies/{company_id}", headers=headers, json={"description": "Cloud infra."}
        )
        assert patch.json()["fit_score"] == 100

    def test_changing_icp_criteria_recomputes_existing_companies(self, client: TestClient):
        auth = _register(client, org_name="Acme Fit Retro", email="owner@acmefitretro.com")
        headers = _auth_headers(auth["access_token"])
        client.put(
            "/api/v1/organizations/icp", headers=headers, json={**EMPTY_CRITERIA, "industries": ["Fintech"]}
        )
        create = client.post("/api/v1/companies", headers=headers, json={"name": "Nimbus", "industry": "Retail"})
        company_id = create.json()["id"]
        assert create.json()["fit_score"] == 0

        # New ICP now matches this same company's industry — its
        # already-existing fit_score should update without anyone
        # touching the company itself.
        client.put(
            "/api/v1/organizations/icp", headers=headers, json={**EMPTY_CRITERIA, "industries": ["Retail"]}
        )
        again = client.get(f"/api/v1/companies/{company_id}", headers=headers)
        assert again.json()["fit_score"] == 100
