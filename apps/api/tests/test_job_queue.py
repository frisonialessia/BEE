"""Tests for the durable job queue — app.services.job_queue.JobQueueService
(the generic Redis primitive) and app.services.external_api.worker's
run_job_queue_tick (the ingestion-specific drain/process/retry logic that
uses it), plus the GET /internal/jobs/tick cron endpoint.

Uses fakeredis, same hermetic-test philosophy as the rest of this suite.
_process_sync itself (the actual signal-ingestion/enrichment work) is
mocked here — it already has its own coverage via test_external_ingestion.py
and the SignalEngine test suite; these tests are about the queue mechanics
(drain, backoff, dead-lettering) around it, not re-proving _process_sync
works.
"""

from __future__ import annotations

from unittest.mock import patch

import fakeredis
import pytest
from fastapi.testclient import TestClient

from app.core import redis as bee_redis
from app.services.external_api.worker import (
    IngestionTask,
    IngestionTaskType,
    IngestionWorker,
    run_job_queue_tick,
)
from app.services.job_queue import JobQueueService, get_job_queue_service, reset_job_queue_service


@pytest.fixture
def fake_client():
    client = fakeredis.FakeStrictRedis(decode_responses=True)
    yield client
    client.flushall()


@pytest.fixture(autouse=True)
def _reset_singletons():
    bee_redis.reset_redis_client_cache()
    reset_job_queue_service()
    yield
    bee_redis.reset_redis_client_cache()
    reset_job_queue_service()


class TestJobQueueServicePrimitives:
    def test_unavailable_without_redis(self) -> None:
        svc = JobQueueService()
        assert svc.available is False
        assert svc.enqueue({"x": 1}) is False
        assert svc.drain_batch(10) == []
        assert svc.reschedule({"id": "x", "attempt": 0, "payload": {}}, delay_seconds=1) is False
        assert svc.queue_depth() == 0

    def test_enqueue_then_drain_roundtrip(self, monkeypatch: pytest.MonkeyPatch, fake_client) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        svc = JobQueueService()

        assert svc.enqueue({"hello": "world"}) is True
        assert svc.queue_depth() == 1

        batch = svc.drain_batch(10)
        assert len(batch) == 1
        assert batch[0]["payload"] == {"hello": "world"}
        assert batch[0]["attempt"] == 0
        # Drained entries are removed.
        assert svc.queue_depth() == 0

    def test_delayed_enqueue_not_drained_early(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        svc = JobQueueService()
        svc.enqueue({"x": 1}, delay_seconds=3600)

        assert svc.drain_batch(10) == []
        assert svc.queue_depth() == 1  # still there, just not ready

    def test_reschedule_increments_attempt_and_delays(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        svc = JobQueueService()
        svc.enqueue({"x": 1})
        envelope = svc.drain_batch(10)[0]
        assert envelope["attempt"] == 0

        assert svc.reschedule(envelope, delay_seconds=3600) is True
        assert svc.drain_batch(10) == []  # not ready yet
        assert svc.queue_depth() == 1

    def test_batch_respects_limit(self, monkeypatch: pytest.MonkeyPatch, fake_client) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        svc = JobQueueService()
        for i in range(5):
            svc.enqueue({"i": i})

        assert len(svc.drain_batch(2)) == 2
        assert svc.queue_depth() == 3


def _make_task() -> IngestionTask:
    return IngestionTask(
        task_type=IngestionTaskType.EXTERNAL_WEBHOOK,
        provider="linkedin",
        payload={"event_type": "page_view"},
    )


class TestRunJobQueueTick:
    def test_disabled_by_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.core.config.settings.JOB_QUEUE_BACKEND", "in_process")
        summary = run_job_queue_tick()
        assert summary.enabled is False
        assert summary.processed == 0

    def test_enabled_empty_queue_is_a_clean_noop(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        monkeypatch.setattr("app.core.config.settings.JOB_QUEUE_BACKEND", "redis")

        summary = run_job_queue_tick()
        assert summary.enabled is True
        assert summary.processed == 0
        assert summary.remaining_depth == 0

    def test_successful_task_is_processed(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        monkeypatch.setattr("app.core.config.settings.JOB_QUEUE_BACKEND", "redis")
        get_job_queue_service().enqueue(_task_to_dict(_make_task()))

        with patch.object(IngestionWorker, "_process_sync") as mock_process:
            summary = run_job_queue_tick()

        mock_process.assert_called_once()
        assert summary.processed == 1
        assert summary.rescheduled == 0
        assert summary.dead_lettered == 0
        assert summary.remaining_depth == 0

    def test_failed_task_is_rescheduled_with_backoff(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        monkeypatch.setattr("app.core.config.settings.JOB_QUEUE_BACKEND", "redis")
        get_job_queue_service().enqueue(_task_to_dict(_make_task()))

        with patch.object(IngestionWorker, "_process_sync", side_effect=RuntimeError("boom")):
            summary = run_job_queue_tick()

        assert summary.processed == 0
        assert summary.rescheduled == 1
        assert summary.dead_lettered == 0
        # Rescheduled with a future score — still in the queue, just not
        # immediately ready.
        assert summary.remaining_depth == 1

    def test_task_exhausting_attempts_is_dead_lettered(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        from app.models.dead_letter import _MAX_ATTEMPTS

        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        monkeypatch.setattr("app.core.config.settings.JOB_QUEUE_BACKEND", "redis")

        queue = get_job_queue_service()
        # Enqueue already at the last retryable attempt.
        queue.enqueue(_task_to_dict(_make_task()), attempt=_MAX_ATTEMPTS - 1)

        with (
            patch.object(IngestionWorker, "_process_sync", side_effect=RuntimeError("boom")),
            patch.object(IngestionWorker, "_send_to_dlq") as mock_dlq,
        ):
            summary = run_job_queue_tick()

        mock_dlq.assert_called_once()
        assert summary.rescheduled == 0
        assert summary.dead_lettered == 1
        assert summary.remaining_depth == 0  # not re-added — it's in the DLQ now


class TestIngestionWorkerRedisBackend:
    def test_enqueue_uses_durable_queue_when_configured(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        import asyncio

        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        monkeypatch.setattr("app.core.config.settings.JOB_QUEUE_BACKEND", "redis")
        worker = IngestionWorker(queue_size=10)
        task = _make_task()

        asyncio.run(worker.enqueue(task))

        # Went to the durable queue, not the in-process asyncio.Queue.
        assert worker.queue_depth == 0
        assert get_job_queue_service().queue_depth() == 1

    def test_enqueue_falls_back_to_in_process_when_redis_unavailable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import asyncio

        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: None)
        monkeypatch.setattr("app.core.config.settings.JOB_QUEUE_BACKEND", "redis")
        worker = IngestionWorker(queue_size=10)
        task = _make_task()

        asyncio.run(worker.enqueue(task))

        # No durable queue available — falls back to the worker's own queue.
        assert worker.queue_depth == 1


class TestJobQueueTickEndpoint:
    def test_disabled_by_default_returns_404(self, client: TestClient) -> None:
        resp = client.get("/api/v1/internal/jobs/tick")
        assert resp.status_code == 404

    def test_missing_secret_rejected_when_configured(self, client: TestClient) -> None:
        from app.core.config import settings as app_settings

        with patch.object(app_settings, "CRON_SECRET", "super-secret-value"):
            resp = client.get("/api/v1/internal/jobs/tick")
        assert resp.status_code == 401

    def test_wrong_secret_rejected(self, client: TestClient) -> None:
        from app.core.config import settings as app_settings

        with patch.object(app_settings, "CRON_SECRET", "super-secret-value"):
            resp = client.get(
                "/api/v1/internal/jobs/tick", headers={"Authorization": "Bearer not-it"}
            )
        assert resp.status_code == 401

    def test_correct_secret_but_feature_disabled_is_a_clean_noop(self, client: TestClient) -> None:
        from app.core.config import settings as app_settings

        with patch.object(app_settings, "CRON_SECRET", "super-secret-value"):
            resp = client.get(
                "/api/v1/internal/jobs/tick",
                headers={"Authorization": "Bearer super-secret-value"},
            )
        assert resp.status_code == 200, resp.text
        assert resp.json()["enabled"] is False


def _task_to_dict(task: IngestionTask) -> dict:
    from app.services.external_api.worker import _task_to_dict as impl

    return impl(task)
