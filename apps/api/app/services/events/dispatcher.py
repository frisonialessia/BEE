"""Lightweight in-process domain-event dispatcher.

Why this exists: today, when one part of BEE's data changes, nothing else
in the platform finds out unless the endpoint that made the change also
happens to call the right function directly — and usually it doesn't. A
mutation-propagation audit across the codebase found several real gaps
this way (editing a Company doesn't refresh anything scored off it,
merging leads left a Meeting pointing at a deleted row — see
``LeadRepository.merge``'s own fix — meetings never fed back into
anything). The common cause wasn't any one bug: it's that there is no
shared place for "when X happens, do Y" to live, so every reactive
behavior either gets hand-wired into the one endpoint that happens to
call it, or never gets written at all.

This gives that behavior one place to register instead of editing N
existing endpoints every time a new reaction is needed — subscribe once,
in ``app.services.events.listeners``, and every publisher of that event
picks it up automatically.

Deliberately NOT a message queue, outbox table, or Celery-style task —
see ``JobQueueService`` for genuine async background work (durable,
retryable, survives a crash mid-job). This dispatcher is the opposite
shape on purpose: in-process, synchronous, same request, same DB
transaction as the publisher. That's exactly right for "keep two rows in
the same database consistent with each other" (recompute a score,
increment a counter) and exactly wrong for anything that needs to survive
a crash, retry on failure, or run outside the publisher's own
transaction — that class of work still belongs in JobQueueService, not
here.

A listener's exception is caught and logged, never allowed to fail the
request that published the event — same "enrichment must never break the
primary action" convention every other best-effort call in this codebase
already follows (see StrategyGeneratorService.enrich's call sites in
opportunities.py/leads.py).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

Listener = Callable[..., None]

_listeners: dict[str, list[Listener]] = defaultdict(list)


def subscribe(event_name: str, listener: Listener) -> None:
    """Register `listener` to run whenever `event_name` is published.

    Call this once, at import time — ``app.services.events.listeners``
    (imported once from ``app.main`` at startup) is the one place this
    should happen. Calling it per-request would just keep stacking
    duplicate registrations of the same function.
    """
    _listeners[event_name].append(listener)


def publish(event_name: str, /, **kwargs: Any) -> None:
    """Run every listener registered for `event_name`, in registration
    order, synchronously, in the caller's own DB session/transaction.

    Each listener's exception is caught and logged — one broken listener
    never blocks the others or fails the request that published the
    event. Callers pass whatever a given event's listeners need as
    keyword arguments (every event in ``listeners.py`` documents its own
    contract); there is no fixed payload shape.
    """
    for listener in _listeners[event_name]:
        try:
            listener(**kwargs)
        except Exception:
            logger.exception(
                "Event listener %r failed for event %r",
                getattr(listener, "__name__", listener),
                event_name,
            )


def clear_listeners() -> None:
    """Test-only: reset every subscription. Without this, importing
    ``app.services.events.listeners`` more than once across the test
    suite's module-reload boundaries could double-register the same
    listener — see conftest.py's fixture that calls this between tests."""
    _listeners.clear()
