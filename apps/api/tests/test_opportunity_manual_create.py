"""Tests for POST /opportunities — manual opportunity creation.

The CRM "+ Nueva oportunidad" counterpart to the automatic signal→opportunity
pipeline. Covers: company/lead get-or-create resolution (no duplicates on a
matching name/domain), organization + assignment stamping, and that the
manually-synthesized signal actually runs through StrategyGeneratorService
the same way an inbound webhook signal does.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.base import OpportunityStatus, SignalSource, UserRole
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.signal import Signal
from app.models.user import User


def _make_org_and_owner(session: Session, name: str) -> tuple[Organization, User]:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"{name.lower()}@x.io",
        hashed_password=hash_password("password123"),
        full_name="Owner",
        role=UserRole.OWNER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return org, user


def _auth_headers(user: User) -> dict:
    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestCreateOpportunityManually:
    def test_requires_authentication(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/opportunities",
            json={"company_name": "Acme", "description": "Vi que están creciendo rápido."},
        )
        assert resp.status_code == 401

    def test_creates_company_lead_signal_and_opportunity(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgManual")

        resp = client.post(
            "/api/v1/opportunities",
            headers=_auth_headers(owner),
            json={
                "company_name": "Acme Corp",
                "company_domain": "acme.com",
                "company_industry": "SaaS",
                "lead_full_name": "Jane Doe",
                "lead_email": "jane@acme.com",
                "lead_title": "VP Sales",
                "signal_type": "hiring",
                "description": "Están contratando activamente para el equipo de ventas.",
                "score": 70,
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()

        assert body["company_id"] is not None
        assert body["lead_id"] is not None
        assert body["signal_id"] is not None
        assert body["score"] == 70

        company = session.get(Company, uuid.UUID(body["company_id"]))
        assert company is not None
        assert company.name == "Acme Corp"
        assert company.organization_id == org.id

        lead = session.get(Lead, uuid.UUID(body["lead_id"]))
        assert lead is not None
        assert lead.full_name == "Jane Doe"
        assert lead.organization_id == org.id

        signal = session.get(Signal, uuid.UUID(body["signal_id"]))
        assert signal is not None
        assert signal.source == SignalSource.MANUAL
        assert signal.organization_id == org.id

        opportunity = session.get(Opportunity, uuid.UUID(body["id"]))
        assert opportunity is not None
        assert opportunity.organization_id == org.id
        assert opportunity.assigned_to_user_id == owner.id

        # The hiring signal type routes to HiringStrategyGenerator, which
        # always produces a complete battlecard — so this should already be
        # promoted to READY_TO_ACTION, same as the automatic pipeline would.
        assert opportunity.status == OpportunityStatus.READY_TO_ACTION
        assert opportunity.strategy.get("pain_point")
        assert opportunity.strategy.get("closing_argument")

    def test_reuses_existing_company_by_domain_instead_of_duplicating(
        self, client: TestClient, session: Session
    ) -> None:
        org, owner = _make_org_and_owner(session, "OrgDedup")
        existing = Company(name="Beta Inc", domain="beta.io", organization_id=org.id)
        session.add(existing)
        session.commit()
        session.refresh(existing)

        resp = client.post(
            "/api/v1/opportunities",
            headers=_auth_headers(owner),
            json={
                "company_name": "Beta Inc",
                "company_domain": "beta.io",
                "description": "Contexto de la oportunidad.",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["company_id"] == str(existing.id)

        companies = session.exec(select(Company).where(Company.domain == "beta.io")).all()
        assert len(companies) == 1

    def test_lead_is_optional(self, client: TestClient, session: Session) -> None:
        _, owner = _make_org_and_owner(session, "OrgNoLead")

        resp = client.post(
            "/api/v1/opportunities",
            headers=_auth_headers(owner),
            json={
                "company_name": "Solo Company",
                "description": "Todavía no sé quién decide ahí.",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["lead_id"] is None
        assert resp.json()["company_id"] is not None

    def test_description_is_required(self, client: TestClient, session: Session) -> None:
        _, owner = _make_org_and_owner(session, "OrgNoDesc")

        resp = client.post(
            "/api/v1/opportunities",
            headers=_auth_headers(owner),
            json={"company_name": "No Description Co"},
        )
        assert resp.status_code == 422
