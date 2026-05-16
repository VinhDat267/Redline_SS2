from __future__ import annotations

from collections.abc import Callable
from threading import Event, Thread

from sqlalchemy.orm import sessionmaker

from app.services import ai_batch_jobs as ai_batch_job_service


class AIBatchWorker:
    def __init__(
        self,
        session_factory: sessionmaker,
        *,
        concurrency: int,
        poll_interval_seconds: float,
        process_next_job: Callable[..., bool] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._concurrency = concurrency
        self._poll_interval_seconds = poll_interval_seconds
        self._process_next_job = process_next_job or ai_batch_job_service.process_next_ai_batch_job
        self._stop_event = Event()
        self._wake_event = Event()
        self._thread: Thread | None = None

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = Thread(target=self._run_loop, name="redline-ai-batch-worker", daemon=True)
        self._thread.start()
        self.wake()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._thread is not None:
            self._thread.join(timeout=max(1.0, self._poll_interval_seconds + 1.0))
        self._thread = None

    def wake(self) -> None:
        self._wake_event.set()

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            self._wake_event.wait(timeout=self._poll_interval_seconds)
            self._wake_event.clear()

            if self._stop_event.is_set():
                return

            while not self._stop_event.is_set():
                try:
                    processed = self._process_next_job(
                        self._session_factory,
                        concurrency=self._concurrency,
                    )
                except Exception:
                    processed = False

                if not processed:
                    break
