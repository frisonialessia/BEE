"""Regression tests: GET /leads and GET /opportunities must scope by
organization_id, not just by assigned_to_user_id.

Before this fix, OpportunityRepository.list_scoped/list_ready_to_action and
LeadRepository.list_scoped applied only the visible_user_ids (assignment)
filter — which is None for OWNER/ADMIN ("no per-user restriction"), so an
OWNER/ADMIN calling these endpoints saw every organization's leads and
opportunities, not just their own. Same gap existed on the single-record
GET/battlecard/outcome/artifacts endpoints, which checked assignment only.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.models.base import UserRole
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.organization import Organization


def _make_org(session, name: str) -> Organization:
    import uuid

    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_owner(session, org: Organization, email: str):
    from app.core.security import hash_password
    from app.models.user import User

    user = User(
        organization_id=org.id,
        email=email,
        hashed_password=hash_password("password123"),
        full_name="Owner",
        role=UserRole.OWNER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestLeadsOrgIsolation:
    def test_owner_only_sees_own_organization_leads(self, client: TestClient, session):
        org_a = _make_org(session, "Org A")
        org_b = _make_org(session, "Org B")
        owner_a = _make_owner(session, org_a, "leada@x.io")
        session.add(Lead(full_name="Lead A", organization_id=org_a.id))
        session.add(Lead(full_name="Lead B", organization_id=org_b.id))
        session.commit()

        token = create_access_token(owner_a.id, organization_id=org_a.id, role=owner_a.role.value)
        resp = client.get("/api/v1/leads", headers=_auth_headers(token))
        names = [lead["full_name"] for lead in resp.json()]
        assert names == ["Lead A"]

    def test_owner_cannot_fetch_other_orgs_lead_by_id(self, client: TestClient, session):
        org_a = _make_org(session, "Org C")
        org_b = _make_org(session, "Org D")
        owner_a = _make_owner(session, org_a, "leadc@x.io")
        other_lead = Lead(full_name="Other org lead", organization_id=org_b.id)
        session.add(other_lead)
        session.commit()
        session.refresh(other_lead)

        token = create_access_token(owner_a.id, organization_id=org_a.id, role=owner_a.role.value)
        resp = client.get(f"/api/v1/leads/{other_lead.id}", headers=_auth_headers(token))
        assert resp.status_code == 404


class TestOpportunitiesOrgIsolation:
    def test_owner_only_sees_own_organization_opportunities(self, client: TestClient, session):
        org_a = _make_org(session, "Org E")
        org_b = _make_org(session, "Org F")
        owner_a = _make_owner(session, org_a, "oppe@x.io")
        session.add(Opportunity(title="Opp A", organization_id=org_a.id))
        session.add(Opportunity(title="Opp B", organization_id=org_b.id))
        session.commit()

        token = create_access_token(owner_a.id, organization_id=org_a.id, role=owner_a.role.value)
        # No status filter — this is the real "everything for my org" request
        # every actual frontend caller makes (CRM board, Forecast, etc.); an
        # explicit status has to be a real OpportunityStatus member now (see
        # list_opportunities' docstring), so "all" isn't a valid value here.
        resp = client.get("/api/v1/opportunities", headers=_auth_headers(token))
        titles = [o["title"] for o in resp.json()]
        assert titles == ["Opp A"]

    def test_owner_cannot_fetch_other_orgs_battlecard(self, client: TestClient, session):
        org_a = _make_org(session, "Org G")
        org_b = _make_org(session, "Org H")
        owner_a = _make_owner(session, org_a, "oppg@x.io")
        other_opp = Opportunity(title="Other org opp", organization_id=org_b.id)
        session.add(other_opp)
        session.commit()
        session.refresh(other_opp)

        token = create_access_token(owner_a.id, organization_id=org_a.id, role=owner_a.role.value)
        resp = client.get(
            f"/api/v1/opportunities/{other_opp.id}/battlecard", headers=_auth_headers(token)
        )
        assert resp.status_code == 404

    def test_untagged_opportunity_still_visible_everywhere(self, client: TestClient, session):
        """Legacy/untagged (organization_id=NULL) opportunities stay visible to
        everyone — same backward-compat rule as Signal/Company."""
        org_a = _make_org(session, "Org I")
        owner_a = _make_owner(session, org_a, "oppi@x.io")
        session.add(Opportunity(title="Legacy opp", organization_id=None))
        session.commit()

        token = create_access_token(owner_a.id, organization_id=org_a.id, role=owner_a.role.value)
        # No status filter — this is the real "everything for my org" request
        # every actual frontend caller makes (CRM board, Forecast, etc.); an
        # explicit status has to be a real OpportunityStatus member now (see
        # list_opportunities' docstring), so "all" isn't a valid value here.
        resp = client.get("/api/v1/opportunities", headers=_auth_headers(token))
        titles = [o["title"] for o in resp.json()]
        assert "Legacy opp" in titles
