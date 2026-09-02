"""Tests for POST /leads/merge — in particular that Meeting.lead_id gets
repointed the same way Opportunity/Signal already were (a real gap: on
Postgres a dangling FK to the deleted lead would raise on delete; on
SQLite's un-enforced FKs in the test DB it just silently orphaned the row).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import UserRole
from app.models.lead import Lead
from app.models.meeting import Meeting
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


def _make_lead(session: Session, org: Organization, email: str) -> Lead:
    lead = Lead(organization_id=org.id, full_name=email.split("@")[0], email=email)
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


class TestLeadMerge:
    def test_merge_repoints_signals_and_opportunities(self, client: TestClient, session: Session) -> None:
        org, owner = _make_org_and_owner(session, "OrgLeadMerge")
        keep = _make_lead(session, org, "keep@acme.com")
        dupe = _make_lead(session, org, "dupe@acme.com")

        opp = Opportunity(organization_id=org.id, lead_id=dupe.id, title="Acme deal", strategy={})
        sig = Signal(organization_id=org.id, lead_id=dupe.id, signal_type="other", source="manual", title="s", description="d", score=50)
        session.add(opp)
        session.add(sig)
        session.commit()
        session.refresh(opp)
        session.refresh(sig)
        opp_id, sig_id, dupe_id = opp.id, sig.id, dupe.id

        resp = client.post(
            "/api/v1/leads/merge",
            json={"keep_id": str(keep.id), "merge_id": str(dupe.id)},
            headers=_auth_headers(owner),
        )
        assert resp.status_code == 200, resp.text

        # The endpoint mutated these rows through its own session (sharing
        # the same underlying connection, but a separate identity map) —
        # expire_all() forces this session to re-read from the DB instead
        # of returning what it already had cached from before the merge.
        # IDs captured above, not read off the (now expired) ORM objects
        # after this point — `dupe` in particular is a deleted row now, and
        # touching any of its attributes post-expire raises
        # ObjectDeletedError instead of just reading stale data.
        session.expire_all()
        opp = session.get(Opportunity, opp_id)
        sig = session.get(Signal, sig_id)
        assert opp is not None and opp.lead_id == keep.id
        assert sig is not None and sig.lead_id == keep.id
        assert session.get(Lead, dupe_id) is None

    def test_merge_repoints_meetings_not_just_signals_and_opportunities(
        self, client: TestClient, session: Session
    ) -> None:
        """The regression this file exists for — Meeting.lead_id used to be
        left pointing at the deleted duplicate."""
        org, owner = _make_org_and_owner(session, "OrgLeadMergeMeetings")
        keep = _make_lead(session, org, "keep2@acme.com")
        dupe = _make_lead(session, org, "dupe2@acme.com")

        meeting = Meeting(
            organization_id=org.id,
            created_by_user_id=owner.id,
            lead_id=dupe.id,
            title="Discovery call",
            starts_at=datetime.now(UTC) + timedelta(days=1),
        )
        session.add(meeting)
        session.commit()
        session.refresh(meeting)
        meeting_id, dupe_id = meeting.id, dupe.id

        resp = client.post(
            "/api/v1/leads/merge",
            json={"keep_id": str(keep.id), "merge_id": str(dupe.id)},
            headers=_auth_headers(owner),
        )
        assert resp.status_code == 200, resp.text

        session.expire_all()
        meeting = session.get(Meeting, meeting_id)
        assert meeting is not None and meeting.lead_id == keep.id
        assert session.get(Lead, dupe_id) is None

    def test_cannot_merge_lead_into_itself(self, client: TestClient, session: Session) -> None:
        org, owner = _make_org_and_owner(session, "OrgLeadMergeSelf")
        lead = _make_lead(session, org, "solo@acme.com")

        resp = client.post(
            "/api/v1/leads/merge",
            json={"keep_id": str(lead.id), "merge_id": str(lead.id)},
            headers=_auth_headers(owner),
        )
        assert resp.status_code == 422
