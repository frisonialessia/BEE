"""Vercel serverless entrypoint.

Vercel's Python runtime auto-detects an ASGI/WSGI application exported as
``app`` from any file under an ``api/`` directory at the project root, and
wires every request routed to it (see ``../vercel.json``'s catch-all
rewrite) through this module. The real application — routes, middleware,
lifespan — lives entirely in ``app.main``; this file only re-exports it so
the same FastAPI app runs identically here, in ``docker compose``, and in
the test suite.
"""

from app.main import app

__all__ = ["app"]
