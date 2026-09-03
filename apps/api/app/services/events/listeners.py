"""Every reactive behavior BEE's mutation endpoints trigger, registered
against the dispatcher in ``dispatcher.py``. Importing this module (via
``register_listeners()`` in the package ``__init__``) is what wires
everything below up — nothing here runs on its own until that happens.

Events published so far (each listed here as they're added, kept in sync
with the actual ``publish()`` call sites — see each event's own docstring
below for its exact kwarg contract):

* ``company.updated`` — a Company's industry/employee_range/country
  changed (app/api/v1/endpoints/companies.py's update_company).
* ``icp_criteria.updated`` — an Organization's ICP criteria changed
  (app/api/v1/endpoints/organizations.py's set_icp_criteria). Two
  listeners: fit-score recompute, and an AdminAuditService entry.
* ``meeting.completed`` — a Meeting was marked completed
  (app/api/v1/endpoints/meetings.py's complete_meeting).
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from app.services.admin_audit import AdminAuditService
from app.services.events.dispatcher import subscribe
from app.services.icp import recompute_company_fit_score, recompute_org_fit_scores
from app.services.meeting_engagement import record_meeting_engagement

# ----- ICP fit-score persistence --------------------------------------------
# See app/services/icp/recompute.py for what these actually do; this file
# only wires *when* they run. Neither listener commits — same transaction
# as the publisher (see dispatcher.py's own docstring on why), so it's
# the publisher's job to commit after publish() returns, same as it
# commits its own primary change.


def _on_company_updated(*, session: Session, company_id: uuid.UUID) -> None:
    recompute_company_fit_score(session, company_id)


def _on_icp_criteria_updated(
    *, session: Session, organization_id: uuid.UUID, actor_user_id: uuid.UUID | None = None
) -> None:
    # actor_user_id is this listener's own no-op — accepted only so the
    # same publish() call also satisfies _on_icp_criteria_updated_audit_log
    # below, subscribed to the identical event.
    del actor_user_id
    recompute_org_fit_scores(session, organization_id)


def _on_icp_criteria_updated_audit_log(
    *, session: Session, organization_id: uuid.UUID, actor_user_id: uuid.UUID | None = None
) -> None:
    AdminAuditService(session).log(
        organization_id=organization_id,
        actor_user_id=actor_user_id,
        action="icp_criteria.updated",
        summary="Ideal Customer Profile criteria updated.",
    )


subscribe("company.updated", _on_company_updated)
subscribe("icp_criteria.updated", _on_icp_criteria_updated)
subscribe("icp_criteria.updated", _on_icp_criteria_updated_audit_log)


# ----- Meetings -> engagement feedback ---------------------------------------
# See app/services/meeting_engagement.py for what this actually does.


def _on_meeting_completed(*, session: Session, meeting_id: uuid.UUID) -> None:
    record_meeting_engagement(session, meeting_id)


subscribe("meeting.completed", _on_meeting_completed)
