"""BEE API — Sales Force Intelligence backend.

A modular, SOLID FastAPI application organized in clean layers:

* ``core``         — configuration, database, security, logging (infrastructure)
* ``models``       — SQLModel persistence entities (the domain schema)
* ``schemas``      — Pydantic DTOs (the external API contract)
* ``repositories`` — encapsulated data access (Repository pattern)
* ``services``     — business logic, incl. the extensible Signal Engine
* ``api``          — thin HTTP transport layer
"""

__version__ = "0.1.0"
