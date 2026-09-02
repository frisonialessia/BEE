"""Public surface for BEE's internal domain-event dispatcher — see
``dispatcher.py`` for the full rationale. Endpoints/services import
``publish`` from here to announce something happened; reactive behavior
subscribes in ``listeners.py``, registered once via ``register_listeners``
(called from ``app.main`` at startup).
"""

from __future__ import annotations

from app.services.events.dispatcher import clear_listeners, publish, subscribe

_registered = False


def register_listeners() -> None:
    """Idempotent — safe to call more than once (the test suite's app
    fixture recreates the FastAPI app per test in some paths). Imports
    ``listeners`` lazily so its own `subscribe()` calls only ever run
    through this one guarded entry point, never as a side effect of some
    unrelated module importing it transitively."""
    global _registered
    if _registered:
        return
    from app.services.events import listeners  # noqa: F401  (import registers listeners)

    _registered = True


__all__ = ["publish", "subscribe", "clear_listeners", "register_listeners"]
