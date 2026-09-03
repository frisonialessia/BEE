"""Tests for the internal domain-event dispatcher (app.services.events) —
pure unit tests, no DB/FastAPI needed. The actual reactive behaviors it
backs (ICP fit-score recompute, meeting-completion feedback) are covered
in their own test files; this only proves the dispatcher's own contract.
"""

from __future__ import annotations

import pytest

from app.services.events import dispatcher
from app.services.events.dispatcher import clear_listeners, publish, subscribe


@pytest.fixture(autouse=True)
def _isolated_listeners():
    """Every test gets a clean listener registry — without this, a
    listener subscribed in one test would still fire (and could leak
    state) in the next.

    Snapshots and restores the real registry rather than just clearing it
    on the way out: ``register_listeners()`` (app.main, called once at
    import time) is guarded to run only once per process, so a bare
    ``clear_listeners()`` left standing here would permanently wipe out
    every real app listener (ICP fit-score recompute, meeting-completion
    feedback, ...) for the rest of the test session the moment this file
    happens to run before theirs alphabetically — which is exactly what
    broke test_icp_fit_score.py/test_meeting_completion.py when run as
    part of the full suite."""
    snapshot = dict(dispatcher._listeners)
    clear_listeners()
    yield
    clear_listeners()
    dispatcher._listeners.update(snapshot)


class TestEventDispatcher:
    def test_subscribed_listener_receives_published_kwargs(self):
        calls = []
        subscribe("widget.updated", lambda **kw: calls.append(kw))

        publish("widget.updated", widget_id="w1", new_value=42)

        assert calls == [{"widget_id": "w1", "new_value": 42}]

    def test_multiple_listeners_all_run_in_registration_order(self):
        order = []
        subscribe("widget.updated", lambda **_kw: order.append("first"))
        subscribe("widget.updated", lambda **_kw: order.append("second"))

        publish("widget.updated")

        assert order == ["first", "second"]

    def test_publish_with_no_listeners_is_a_silent_no_op(self):
        # Must not raise — most events have zero listeners most of the
        # time (a feature not yet built to react to them), and that's
        # the expected, unremarkable case.
        publish("nothing.listens.to.this")

    def test_a_failing_listener_does_not_block_the_next_one(self):
        order = []

        def boom(**_kw):
            order.append("boom")
            raise RuntimeError("listener blew up")

        subscribe("widget.updated", boom)
        subscribe("widget.updated", lambda **_kw: order.append("still ran"))

        publish("widget.updated")  # must not raise

        assert order == ["boom", "still ran"]

    def test_events_are_isolated_by_name(self):
        calls = []
        subscribe("event.a", lambda **_kw: calls.append("a"))
        subscribe("event.b", lambda **_kw: calls.append("b"))

        publish("event.a")

        assert calls == ["a"]
