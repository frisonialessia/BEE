"""Tests for SalesforceImportService — the one-way pull of standard
Salesforce objects into BEE's Company/Lead/Opportunity tables. See
app.services.integrations.salesforce_import.

Every test monkeypatches SalesforceImportService._query directly (never a
real HTTP call) with a dict of {soql_fragment_matched: [records]} so each
test controls exactly what "Salesforce" returns without caring about the
exact SOQL string this module happens to generate.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings as app_settings
from app.core.security import decode_access_token
from app.core.token_crypto import encrypt_token
from app.models.company import Company
from app.models.integration_connection import IntegrationConnection
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.services.integrations import salesforce_import as salesforce_import_module
from app.services.integrations.salesforce_import import (
    SalesforceImportError,
    SalesforceImportService,
)


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _token_encryption_key():
    """The happy-path endpoint test stores a real encrypted token — same
    fixture as test_integrations.py, see its docstring for why."""
    from app.core import token_crypto

    original = app_settings.TOKEN_ENCRYPTION_KEY
    app_settings.TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
    token_crypto._fernet.cache_clear()
    yield
    app_settings.TOKEN_ENCRYPTION_KEY = original
    token_crypto._fernet.cache_clear()


def _mock_query(monkeypatch: pytest.MonkeyPatch, service: SalesforceImportService, responses: dict[str, list[dict]]) -> None:
    """responses maps a SOQL substring (e.g. "FROM Account") to the records
    that query should return; anything unmatched returns []."""

    def _fake_query(soql: str) -> list[dict]:
        for fragment, records in responses.items():
            if fragment in soql:
                return records
        return []

    monkeypatch.setattr(service, "_query", _fake_query)


ACCOUNT = {
    "Id": "001AAA",
    "Name": "Acme Corp",
    "Website": "https://www.acme.com/home",
    "Industry": "Software",
    "NumberOfEmployees": 120,
    "BillingCountry": "US",
}

CONTACT = {
    "Id": "003BBB",
    "FirstName": "Jane",
    "LastName": "Doe",
    "Email": "jane@acme.com",
    "Phone": "555-1234",
    "Title": "VP Sales",
    "AccountId": "001AAA",
}

OPEN_OPPORTUNITY = {
    "Id": "006CCC",
    "Name": "Acme — Enterprise deal",
    "Amount": 50000,
    "StageName": "Negotiation",
    "IsWon": False,
    "IsClosed": False,
    "CloseDate": "2026-12-01",
    "AccountId": "001AAA",
}

WON_OPPORTUNITY = {
    "Id": "006DDD",
    "Name": "Acme — Closed deal",
    "Amount": 20000,
    "StageName": "Contrato Firmado",  # deliberately NOT the stock English name
    "IsWon": True,
    "IsClosed": True,
    "CloseDate": "2026-06-01",
    "AccountId": "001AAA",
}

LOST_OPPORTUNITY = {
    "Id": "006EEE",
    "Name": "Acme — Lost deal",
    "Amount": 15000,
    "StageName": "Perdido - Precio",  # also custom, also not "Closed Lost"
    "IsWon": False,
    "IsClosed": True,
    "CloseDate": "2026-05-01",
    "AccountId": "001AAA",
}


@pytest.fixture()
def org_id() -> uuid.UUID:
    return uuid.uuid4()


class TestImportAccounts:
    def test_creates_a_company_with_normalized_domain_and_salesforce_id(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(monkeypatch, service, {"FROM Account": [ACCOUNT]})

        summary = service.import_all(org_id)
        session.commit()

        assert summary.companies.created == 1
        assert summary.companies.updated == 0

        company = session.exec(select(Company).where(Company.organization_id == org_id)).one()
        assert company.name == "Acme Corp"
        assert company.domain == "acme.com"  # https:// and www. and path stripped
        assert company.attributes["salesforce_id"] == "001AAA"

    def test_rerun_updates_the_same_company_instead_of_duplicating(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(monkeypatch, service, {"FROM Account": [ACCOUNT]})
        service.import_all(org_id)
        session.commit()

        renamed = {**ACCOUNT, "Name": "Acme Corp (renamed)"}
        _mock_query(monkeypatch, service, {"FROM Account": [renamed]})
        summary = service.import_all(org_id)
        session.commit()

        assert summary.companies.created == 0
        assert summary.companies.updated == 1
        companies = session.exec(select(Company).where(Company.organization_id == org_id)).all()
        assert len(companies) == 1
        assert companies[0].name == "Acme Corp (renamed)"

    def test_matches_an_existing_company_by_domain_instead_of_violating_the_unique_constraint(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        """A company BEE already tracks (from a market signal, not
        Salesforce) with the same domain must be matched and enriched, not
        duplicated — a duplicate domain for the same org would violate
        Company's own uq_companies_org_domain constraint."""
        existing = Company(organization_id=org_id, name="Acme (from a signal)", domain="acme.com")
        session.add(existing)
        session.commit()

        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(monkeypatch, service, {"FROM Account": [ACCOUNT]})
        summary = service.import_all(org_id)
        session.commit()

        assert summary.companies.created == 0
        assert summary.companies.updated == 1
        companies = session.exec(select(Company).where(Company.organization_id == org_id)).all()
        assert len(companies) == 1
        assert companies[0].id == existing.id
        assert companies[0].attributes["salesforce_id"] == "001AAA"

    def test_account_without_a_website_does_not_crash(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        no_website = {**ACCOUNT, "Website": None}
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(monkeypatch, service, {"FROM Account": [no_website]})

        summary = service.import_all(org_id)
        session.commit()
        assert summary.companies.created == 1
        assert summary.errors == []


class TestImportContactsAndLeads:
    def test_creates_a_lead_linked_to_its_account(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(monkeypatch, service, {"FROM Account": [ACCOUNT], "FROM Contact": [CONTACT]})

        summary = service.import_all(org_id)
        session.commit()

        assert summary.leads.created == 1
        lead = session.exec(select(Lead).where(Lead.organization_id == org_id)).one()
        assert lead.full_name == "Jane Doe"
        assert lead.email == "jane@acme.com"
        company = session.exec(select(Company).where(Company.organization_id == org_id)).one()
        assert lead.company_id == company.id

    def test_rerun_matches_by_email_even_without_a_prior_salesforce_id(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        """A lead BEE already has (from a signal, matching email) must be
        enriched, not duplicated, on first import."""
        existing = Lead(organization_id=org_id, full_name="Jane D.", email="jane@acme.com")
        session.add(existing)
        session.commit()

        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(monkeypatch, service, {"FROM Account": [ACCOUNT], "FROM Contact": [CONTACT]})
        summary = service.import_all(org_id)
        session.commit()

        assert summary.leads.created == 0
        assert summary.leads.updated == 1
        leads = session.exec(select(Lead).where(Lead.organization_id == org_id)).all()
        assert len(leads) == 1
        assert leads[0].full_name == "Jane Doe"

    def test_contact_with_no_name_is_skipped_not_crashed(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        blank = {**CONTACT, "Id": "003ZZZ", "FirstName": None, "LastName": None}
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(monkeypatch, service, {"FROM Contact": [blank]})

        summary = service.import_all(org_id)
        session.commit()
        assert summary.leads.skipped == 1
        assert summary.leads.created == 0


class TestImportOpportunities:
    def test_status_comes_from_iswon_isclosed_not_the_stage_name(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        """The whole point: StageName is a customized picklist we never
        trust for status — IsWon/IsClosed are booleans Salesforce sets
        regardless of custom stage names."""
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(
            monkeypatch,
            service,
            {
                "FROM Account": [ACCOUNT],
                "FROM Opportunity": [OPEN_OPPORTUNITY, WON_OPPORTUNITY, LOST_OPPORTUNITY],
            },
        )

        summary = service.import_all(org_id)
        session.commit()

        assert summary.opportunities.created == 3
        opps = {o.attributes["salesforce_id"]: o for o in session.exec(select(Opportunity)).all()}
        assert opps["006CCC"].status == "in_progress"
        assert opps["006DDD"].status == "won"
        assert opps["006DDD"].closed_at is not None
        assert opps["006EEE"].status == "lost"
        assert opps["006EEE"].closed_at is not None

    def test_amount_and_company_link_are_set(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(
            monkeypatch, service, {"FROM Account": [ACCOUNT], "FROM Opportunity": [OPEN_OPPORTUNITY]}
        )
        service.import_all(org_id)
        session.commit()

        opp = session.exec(select(Opportunity).where(Opportunity.organization_id == org_id)).one()
        company = session.exec(select(Company).where(Company.organization_id == org_id)).one()
        assert opp.amount == 50000
        assert opp.company_id == company.id

    def test_rerun_updates_status_when_a_deal_closes(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")
        _mock_query(
            monkeypatch, service, {"FROM Account": [ACCOUNT], "FROM Opportunity": [OPEN_OPPORTUNITY]}
        )
        service.import_all(org_id)
        session.commit()

        now_won = {**OPEN_OPPORTUNITY, "IsWon": True, "IsClosed": True}
        _mock_query(monkeypatch, service, {"FROM Account": [ACCOUNT], "FROM Opportunity": [now_won]})
        summary = service.import_all(org_id)
        session.commit()

        assert summary.opportunities.created == 0
        assert summary.opportunities.updated == 1
        opp = session.exec(select(Opportunity).where(Opportunity.organization_id == org_id)).one()
        assert opp.status == "won"


class TestImportAllErrorHandling:
    def test_a_query_failure_is_recorded_not_raised(
        self, session: Session, org_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
    ):
        service = SalesforceImportService(session, access_token="tok", instance_url="https://x.my.salesforce.com")

        def _boom(_soql: str) -> list[dict]:
            raise SalesforceImportError("Salesforce rejected the query: 401")

        monkeypatch.setattr(service, "_query", _boom)

        summary = service.import_all(org_id)
        assert summary.errors
        assert summary.companies.created == 0


class TestSalesforceImportEndpoint:
    def test_requires_a_connection_first(self, client: TestClient):
        auth = _register(client, org_name="No SF Yet Co", email="owner@nosfyet.co")
        resp = client.post(
            "/api/v1/integrations/salesforce/import", headers=_auth_headers(auth["access_token"])
        )
        assert resp.status_code == 400
        assert "Conecta Salesforce" in resp.json()["detail"]

    def test_requires_owner_or_admin(self, client: TestClient):
        auth = _register(client, org_name="SF Import Locked Co", email="owner@sfimportlocked.co")
        owner_headers = _auth_headers(auth["access_token"])
        client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={"email": "member@sfimportlocked.co", "full_name": "A Member", "password": "password123", "role": "member"},
        )
        login = client.post(
            "/api/v1/auth/login", json={"email": "member@sfimportlocked.co", "password": "password123"}
        )
        member_headers = _auth_headers(login.json()["access_token"])

        resp = client.post("/api/v1/integrations/salesforce/import", headers=member_headers)
        assert resp.status_code == 403

    def test_happy_path_imports_and_reports_counts(
        self, client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
    ):
        auth = _register(client, org_name="Real SF Import Co", email="owner@realsfimport.co")
        headers = _auth_headers(auth["access_token"])
        org_id = uuid.UUID(decode_access_token(auth["access_token"])["org"])

        session.add(
            IntegrationConnection(
                organization_id=org_id,
                provider="salesforce",
                external_account_email="realsfimport.my.salesforce.com",
                instance_url="https://realsfimport.my.salesforce.com",
                access_token_encrypted=encrypt_token("fake-token"),
                refresh_token_encrypted=encrypt_token("fake-refresh"),
                token_expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        session.commit()

        def _fake_query(_self: SalesforceImportService, soql: str) -> list[dict]:
            if "FROM Account" in soql:
                return [ACCOUNT]
            if "FROM Contact" in soql:
                return [CONTACT]
            if "FROM Opportunity" in soql:
                return [OPEN_OPPORTUNITY]
            return []

        monkeypatch.setattr(salesforce_import_module.SalesforceImportService, "_query", _fake_query)

        resp = client.post("/api/v1/integrations/salesforce/import", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["companies"]["created"] == 1
        assert body["leads"]["created"] == 1
        assert body["opportunities"]["created"] == 1
        assert body["errors"] == []
