"""Regression tests: one malformed row in /leads/bulk or /leads/import must
not abort the entire batch.

Before this fix, LeadBulkCreateIn.leads / LeadImportIn.rows were typed as
list[LeadCreateIn] / list[LeadImportRow] — FastAPI validates the whole
request body (including every item in a typed list) before the endpoint
function body ever runs, so one row failing a field constraint (an empty
full_name, a company_name over its max_length) 422'd the entire request,
discarding every valid row alongside it. Both endpoints' own docstrings
claimed "one bad row never aborts the batch", which wasn't true above the
per-row try/except. See app.schemas.lead.LeadBulkCreateIn/LeadImportIn.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.user import User


def _auth_headers(session) -> dict:
    org = Organization(name="Test Org", slug=f"test-org-{__import__('uuid').uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"owner-{__import__('uuid').uuid4().hex[:8]}@bee.ai",
        hashed_password=hash_password("password123"),
        full_name="Owner",
        role=UserRole.OWNER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(user.id, organization_id=org.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestBulkCreateLeads:
    def test_one_invalid_row_does_not_abort_the_batch(self, client: TestClient, session):
        headers = _auth_headers(session)
        payload = {
            "leads": [
                {"full_name": "Valid One"},
                {"full_name": ""},  # violates LeadCreateIn's min_length=1
                {"full_name": "Valid Two"},
            ]
        }
        resp = client.post("/api/v1/leads/bulk", json=payload, headers=headers)
        # Would previously be 422 with zero leads created — the whole
        # request rejected before any row was even attempted.
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["created_count"] == 2
        assert len(data["errors"]) == 1
        assert data["errors"][0]["row"] == 1

    def test_bulk_create_runs_data_validator(self, client: TestClient, session):
        """Newly created leads must get the same first-encounter DataValidator
        pass as POST /leads and POST /leads/import — this was missing."""
        headers = _auth_headers(session)
        resp = client.post(
            "/api/v1/leads/bulk",
            json={"leads": [{"full_name": "Needs Validation"}]},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["created_count"] == 1

        listed = client.get("/api/v1/leads", headers=headers).json()
        lead = next(item for item in listed if item["full_name"] == "Needs Validation")
        assert lead["last_validated_at"] is not None
        # No email/linkedin on this row → DataValidator must flag it, not
        # leave the freshness score at its untouched default of 1.0.
        assert lead["validation_flags"]


class TestImportLeads:
    def test_one_oversized_row_does_not_abort_the_batch(self, client: TestClient, session):
        headers = _auth_headers(session)
        payload = {
            "rows": [
                {"full_name": "Valid Row", "email": "valid@example.com"},
                {"full_name": "X" * 300, "email": "toolong@example.com"},  # exceeds max_length=255
                {"full_name": "Another Valid Row", "email": "valid2@example.com"},
            ]
        }
        resp = client.post("/api/v1/leads/import", json=payload, headers=headers)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["total_rows"] == 3
        assert data["leads_created"] == 2
        error_rows = [r for r in data["rows"] if r["status"] == "error"]
        assert len(error_rows) == 1
        assert error_rows[0]["row"] == 1
