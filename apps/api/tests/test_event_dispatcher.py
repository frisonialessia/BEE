"""Tests for the internal domain-event dispatcher (app.services.events) —
pure unit tests, no DB/FastAPI needed. The actual reactive behaviors it
backs (ICP fit-score recompute, meeting-completion feedback) are covered
in their own test files; this only proves the dispatcher's own contract.
"""

from __future__ import annotations

import pytest

from app.services.events.dispatcher import clear_listeners, publish, subscribe


@pytest.fixture(autouse=True)
def _isolated_listeners():
    """Every test gets a clean listener registry — without this, a
    listener subscribed in one test would still fire (and could leak
    state) in the next."""
    clear_listeners()
    yield
    clear_listeners()


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
