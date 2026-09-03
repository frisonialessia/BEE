"""Tests for GET /search — see app.services.brain_search.service."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import SignalType, UserRole
from app.models.company import Company
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.signal import Signal
from app.models.user import User
from app.services.brain_search.service import reset_brain_search_cache


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


class TestBrainSearch:
    def setup_method(self) -> None:
        reset_brain_search_cache()

    def test_empty_query_returns_empty_list(self, client: TestClient, session: Session):
        org = _make_org(session)
        user = _make_user(session, org)

        resp = client.get("/api/v1/search", params={"q": ""}, headers=_headers(user))
        assert resp.status_code == 422  # min_length=1 on q

    def test_finds_matching_company_by_industry(self, client: TestClient, session: Session):
        org = _make_org(session)
        user = _make_user(session, org)
        session.add(Company(organization_id=org.id, name="Acme Fintech Co", industry="fintech"))
        session.add(Company(organization_id=org.id, name="Unrelated Agro Co", industry="agriculture"))
        session.commit()

        resp = client.get("/api/v1/search", params={"q": "fintech"}, headers=_headers(user))

        assert resp.status_code == 200
        body = resp.json()
        titles = [r["title"] for r in body]
        assert "Acme Fintech Co" in titles
        assert all(r["entity_type"] == "company" for r in body if r["title"] == "Acme Fintech Co")

    def test_finds_matching_signal(self, client: TestClient, session: Session):
        org = _make_org(session)
        user = _make_user(session, org)
        session.add(
            Signal(
                organization_id=org.id,
                signal_type=SignalType.FUNDING_ROUND,
                title="Northwind raised a Series B round",
                description="Northwind Labs closed a $20M Series B led by Acme Ventures",
            )
        )
        session.commit()

        resp = client.get("/api/v1/search", params={"q": "series b funding round"}, headers=_headers(user))

        assert resp.status_code == 200
        titles = [r["title"] for r in resp.json()]
        assert "Northwind raised a Series B round" in titles

    def test_finds_matching_opportunity_by_strategy_content(
        self, client: TestClient, session: Session
    ):
        org = _make_org(session)
        user = _make_user(session, org)
        session.add(
            Opportunity(
                organization_id=org.id,
                title="Northwind deal",
                strategy={"pain_point": "Scaling pains after their funding round"},
            )
        )
        session.commit()

        resp = client.get("/api/v1/search", params={"q": "scaling pains"}, headers=_headers(user))

        assert resp.status_code == 200
        titles = [r["title"] for r in resp.json()]
        assert "Northwind deal" in titles

    def test_other_organizations_data_never_leaks_in(self, client: TestClient, session: Session):
        org_a = _make_org(session)
        user_a = _make_user(session, org_a)
        session.add(Company(organization_id=org_a.id, name="Org A Fintech Co", industry="fintech"))

        org_b = _make_org(session)
        session.add(Company(organization_id=org_b.id, name="Org B Fintech Co", industry="fintech"))
        session.commit()

        resp = client.get("/api/v1/search", params={"q": "fintech"}, headers=_headers(user_a))

        assert resp.status_code == 200
        names = [r["title"] for r in resp.json()]
        assert "Org A Fintech Co" in names
        assert "Org B Fintech Co" not in names

    def test_requires_authentication(self, client: TestClient):
        resp = client.get("/api/v1/search", params={"q": "anything"})
        assert resp.status_code in (401, 403)
