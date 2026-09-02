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
  (app/api/v1/endpoints/organizations.py's set_icp_criteria).
* ``meeting.completed`` — a Meeting was marked completed
  (app/api/v1/endpoints/meetings.py's complete_meeting).
"""

from __future__ import annotations

# Phase 3 (ICP fit-score persistence) and Phase 4 (meetings -> engagement
# feedback) add their subscribe() calls here — see those commits.
