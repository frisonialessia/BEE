"""POST /opportunities linked to existing Companies/Leads and shaped as a
deal (owner, starting stage, close date, type) — the CRM's "Nueva
oportunidad" dialog. Hermetic: enrichment/scan for new companies patched."""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.base import OpportunityStatus, UserRole
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.user import User


@pytest.fixture(autouse=True)
def _no_network():
    with (
        patch("app.api.v1.endpoints.opportunities.ExternalAPIOrchestrator.enrich_company_from_domain") as enrich,
        patch("app.api.v1.endpoints.opportunities.MarketScanOrchestrator.scan_company_now", return_value=0) as scan,
    ):
        enrich.return_value.success = False
        yield enrich, scan


def _user(session: Session, *, org: Organization | None = None, role: UserRole = UserRole.OWNER) -> tuple[Organization, User, dict]:
    if org is None:
        org = Organization(name="Linked Org", slug=f"linked-{uuid.uuid4().hex[:8]}")
        session.add(org)
        session.commit()
        session.refresh(org)
    user = User(
        organization_id=org.id,
        email=f"{role.value}-{uuid.uuid4().hex[:8]}@bee.ai",
        hashed_password=hash_password("password123"),
        full_name="Rep",
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.id, organization_id=org.id, role=user.role.value)
    return org, user, {"Authorization": f"Bearer {token}"}


BASE = {"description": "Nos pidieron propuesta tras la ronda.", "signal_type": "funding_round", "score": 70}


class TestExistingCompanyAndLead:
    def test_company_id_attaches_without_creating_a_duplicate(self, client: TestClient, session: Session):
        org, user, headers = _user(session)
        company = Company(name="Nubank", domain="nubank.com.br", organization_id=org.id)
        session.add(company)
        session.commit()
        lead = Lead(full_name="María González", email="maria@nubank.com.br", title="VP Sales", company_id=company.id, organization_id=org.id)
        session.add(lead)
        session.commit()

        resp = client.post(
            "/api/v1/opportunities",
            headers=headers,
            json={**BASE, "company_id": str(company.id), "lead_id": str(lead.id)},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["company_id"] == str(company.id) and body["lead_id"] == str(lead.id)
        assert body["assigned_to_user_id"] == str(user.id)
        assert session.exec(select(Company).where(Company.name == "Nubank")).all().__len__() == 1

    def test_company_name_that_already_exists_attaches_too(self, client: TestClient, session: Session):
        org, _, headers = _user(session)
        company = Company(name="Rappi", domain="rappi.com", organization_id=org.id)
        session.add(company)
        session.commit()
        resp = client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_name": "Rappi"})
        assert resp.status_code == 201
        assert resp.json()["company_id"] == str(company.id)

    def test_cross_tenant_company_or_lead_is_404(self, client: TestClient, session: Session):
        _, _, headers = _user(session)
        other_org, _, _ = _user(session)
        foreign = Company(name="Theirs", organization_id=other_org.id)
        session.add(foreign)
        session.commit()
        assert client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_id": str(foreign.id)}).status_code == 404
        foreign_lead = Lead(full_name="X", company_id=foreign.id, organization_id=other_org.id)
        session.add(foreign_lead)
        session.commit()
        assert (
            client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_name": "Mine", "lead_id": str(foreign_lead.id)}).status_code
            == 404
        )

    def test_company_identity_is_required(self, client: TestClient, session: Session):
        _, _, headers = _user(session)
        assert client.post("/api/v1/opportunities", headers=headers, json=BASE).status_code == 422


class TestDealShape:
    def test_owner_stage_close_date_and_type_are_persisted(self, client: TestClient, session: Session):
        org, _, headers = _user(session)
        _, colleague, _ = _user(session, org=org, role=UserRole.MEMBER)
        resp = client.post(
            "/api/v1/opportunities",
            headers=headers,
            json={
                **BASE,
                "company_name": "Kavak",
                "assigned_to_user_id": str(colleague.id),
                "status": "in_progress",
                "expected_close_date": "2026-12-15",
                "opportunity_type": "expansion",
                "amount": 45000,
            },
        )
        assert resp.status_code == 201, resp.text
        opp = session.get(Opportunity, uuid.UUID(resp.json()["id"]))
        assert opp is not None
        assert opp.assigned_to_user_id == colleague.id
        assert opp.status == OpportunityStatus.IN_PROGRESS
        assert opp.expected_close_date == date(2026, 12, 15)
        assert opp.opportunity_type == "expansion"
        assert opp.amount == 45000

    def test_detected_start_lets_the_generator_promote(self, client: TestClient, session: Session):
        _, _, headers = _user(session)
        resp = client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_name": "Clip", "status": "detected"})
        assert resp.status_code == 201
        # The rule-based generator writes a complete battlecard → READY.
        assert resp.json()["status"] == "ready_to_action"

    def test_rejects_ready_to_action_bad_type_and_foreign_owner(self, client: TestClient, session: Session):
        _, _, headers = _user(session)
        other_org, other_user, _ = _user(session)
        assert client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_name": "A", "status": "ready_to_action"}).status_code == 422
        assert client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_name": "A", "opportunity_type": "bogus"}).status_code == 422
        assert (
            client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_name": "A", "assigned_to_user_id": str(other_user.id)}).status_code
            == 400
        )


class TestNewCompanyEnrichment:
    def test_new_company_with_domain_is_enriched_and_scanned(self, client: TestClient, session: Session, _no_network):
        enrich, scan = _no_network
        _, _, headers = _user(session)
        resp = client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_name": "Bitso", "company_domain": "https://bitso.com/"})
        assert resp.status_code == 201
        enrich.assert_called_once()
        assert enrich.call_args.kwargs["company_domain"] == "bitso.com"
        scan.assert_called_once()

    def test_existing_company_is_not_re_enriched(self, client: TestClient, session: Session, _no_network):
        enrich, scan = _no_network
        org, _, headers = _user(session)
        company = Company(name="Bitso", domain="bitso.com", organization_id=org.id)
        session.add(company)
        session.commit()
        resp = client.post("/api/v1/opportunities", headers=headers, json={**BASE, "company_id": str(company.id)})
        assert resp.status_code == 201
        enrich.assert_not_called()
        scan.assert_not_called()
