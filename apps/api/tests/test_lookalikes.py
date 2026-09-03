"""Tests for GET /companies/lookalikes — see app.services.lookalike.service."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import OpportunityStatus, UserRole
from app.models.company import Company
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.user import User


def _make_org(session: Session) -> Organization:
    org = Organization(name="Acme", slug=f"acme-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_user(session: Session, org: Organization) -> User:
    user = User(
        organization_id=org.id,
        email=f"{uuid.uuid4().hex[:10]}@acme.io",
        hashed_password=hash_password("password123"),
        full_name="Owner",
        role=UserRole.OWNER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _headers(user: User) -> dict:
    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def _make_company(session: Session, org: Organization, **kwargs) -> Company:
    defaults = {"name": "Co", "industry": "fintech", "size": "50-200", "country": "US"}
    defaults.update(kwargs)
    company = Company(organization_id=org.id, **defaults)
    session.add(company)
    session.commit()
    session.refresh(company)
    return company


def _make_won_opportunity(session: Session, org: Organization, company: Company) -> Opportunity:
    opp = Opportunity(
        organization_id=org.id,
        company_id=company.id,
        title=f"{company.name} deal",
        status=OpportunityStatus.WON,
    )
    session.add(opp)
    session.commit()
    session.refresh(opp)
    return opp


class TestLookalikes:
    def test_no_won_deals_yields_empty_list(self, client: TestClient, session: Session):
        org = _make_org(session)
        user = _make_user(session, org)
        _make_company(session, org, name="Prospect Co")

        resp = client.get("/api/v1/companies/lookalikes", headers=_headers(user))

        assert resp.status_code == 200
        assert resp.json() == []

    def test_ranks_untapped_companies_by_resemblance_to_won_book(
        self, client: TestClient, session: Session
    ):
        org = _make_org(session)
        user = _make_user(session, org)

        won_company = _make_company(
            session, org, name="Won Fintech Co", industry="fintech", size="50-200", country="US"
        )
        _make_won_opportunity(session, org, won_company)

        close_match = _make_company(
            session, org, name="Untapped Fintech Co", industry="fintech", size="50-200", country="US"
        )
        far_match = _make_company(
            session, org, name="Untapped Agro Co", industry="agriculture", size="5000+", country="BR"
        )

        resp = client.get("/api/v1/companies/lookalikes", headers=_headers(user))

        assert resp.status_code == 200
        body = resp.json()
        result_ids = [row["company_id"] for row in body]

        # The won company and any company already being worked never appear
        # as a suggestion — only the untapped pool is eligible.
        assert str(won_company.id) not in result_ids

        assert str(close_match.id) in result_ids
        close_row = next(r for r in body if r["company_id"] == str(close_match.id))
        assert close_row["similarity"] > 0

        if str(far_match.id) in result_ids:
            far_row = next(r for r in body if r["company_id"] == str(far_match.id))
            assert close_row["similarity"] >= far_row["similarity"]

    def test_company_already_worked_is_never_suggested(self, client: TestClient, session: Session):
        org = _make_org(session)
        user = _make_user(session, org)

        won_company = _make_company(session, org, name="Won Co", industry="fintech")
        _make_won_opportunity(session, org, won_company)

        already_worked = _make_company(session, org, name="In Progress Co", industry="fintech")
        session.add(
            Opportunity(
                organization_id=org.id,
                company_id=already_worked.id,
                title="Open deal",
                status=OpportunityStatus.IN_PROGRESS,
            )
        )
        session.commit()

        resp = client.get("/api/v1/companies/lookalikes", headers=_headers(user))

        assert resp.status_code == 200
        result_ids = [row["company_id"] for row in resp.json()]
        assert str(already_worked.id) not in result_ids

    def test_other_organizations_data_never_leaks_in(self, client: TestClient, session: Session):
        org_a = _make_org(session)
        user_a = _make_user(session, org_a)
        won_a = _make_company(session, org_a, name="Org A Won", industry="fintech")
        _make_won_opportunity(session, org_a, won_a)
        _make_company(session, org_a, name="Org A Prospect", industry="fintech")

        org_b = _make_org(session)
        won_b = _make_company(session, org_b, name="Org B Won", industry="fintech")
        _make_won_opportunity(session, org_b, won_b)
        _make_company(session, org_b, name="Org B Prospect", industry="fintech")

        resp = client.get("/api/v1/companies/lookalikes", headers=_headers(user_a))

        assert resp.status_code == 200
        names = [row["name"] for row in resp.json()]
        assert "Org A Prospect" in names
        assert "Org B Prospect" not in names
