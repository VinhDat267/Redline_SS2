"""
In-memory pub/sub event broker for real-time project updates via SSE.

Each project has its own channel. When a mutation occurs (document created,
member added, etc.), the relevant service calls `publish()`. All connected
SSE clients for that project receive the event instantly.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

# ── Event types ──────────────────────────────────────────────────────────────

EVENT_DOCUMENT_CREATED = "document_created"
EVENT_DOCUMENT_UPDATED = "document_updated"
EVENT_DOCUMENT_DELETED = "document_deleted"
EVENT_CONTRACT_CREATED = "contract_created"
EVENT_CONTRACT_UPDATED = "contract_updated"
EVENT_CONTRACT_DELETED = "contract_deleted"
EVENT_VERSION_CREATED = "version_created"
EVENT_MEMBER_ADDED = "member_added"
EVENT_MEMBER_REMOVED = "member_removed"
EVENT_INVITATION_CREATED = "invitation_created"
EVENT_INVITATION_ACCEPTED = "invitation_accepted"
EVENT_INVITATION_DECLINED = "invitation_declined"
EVENT_COMPARE_STARTED = "compare_started"
EVENT_COMPARE_COMPLETED = "compare_completed"
EVENT_REVIEW_COMPLETED = "review_completed"
EVENT_ACTIVITY = "activity"
EVENT_PROJECT_UPDATED = "project_updated"
EVENT_PROJECT_DELETED = "project_deleted"
EVENT_REQUIREMENT_CREATED = "requirement_created"
EVENT_REQUIREMENT_UPDATED = "requirement_updated"
EVENT_REQUIREMENT_DELETED = "requirement_deleted"
EVENT_TEST_CASE_CREATED = "test_case_created"
EVENT_TEST_CASE_UPDATED = "test_case_updated"
EVENT_TEST_CASE_DELETED = "test_case_deleted"
EVENT_CHANGE_ITEM_REVIEWED = "change_item_reviewed"
EVENT_CHANGE_ITEM_COMMENTED = "change_item_commented"


@dataclass
class ProjectEvent:
    event_type: str
    project_id: int
    data: dict[str, Any] = field(default_factory=dict)
    actor_user_id: int | None = None
    actor_display_name: str | None = None
    timestamp: float = field(default_factory=time.time)

    def to_sse(self) -> str:
        """Format as SSE message."""
        payload = {
            "type": self.event_type,
            "project_id": self.project_id,
            "data": self.data,
            "actor_user_id": self.actor_user_id,
            "actor_display_name": self.actor_display_name,
            "timestamp": self.timestamp,
        }
        return f"event: project_update\ndata: {json.dumps(payload)}\n\n"


class ProjectEventBroker:
    """
    Simple in-memory pub/sub for project events.

    Usage:
        broker = get_event_broker()

        # Publishing (from service layer, sync context)
        broker.publish(ProjectEvent(event_type="document_created", project_id=1, data={...}))

        # Subscribing (from SSE endpoint, async context)
        async for event in broker.subscribe(project_id=1):
            yield event.to_sse()
    """

    def __init__(self) -> None:
        # project_id -> set of asyncio.Queue
        self._subscribers: dict[int, set[asyncio.Queue]] = defaultdict(set)

    def publish(self, event: ProjectEvent) -> None:
        """Push event to all subscribers of the given project (thread-safe).

        Sync route handlers run in a thread-pool executor, but asyncio.Queue
        is NOT thread-safe.  We detect the calling context and use
        ``loop.call_soon_threadsafe`` when publishing from a worker thread so
        that ``put_nowait`` always executes on the event-loop thread.
        """
        queues = list(self._subscribers.get(event.project_id, set()))
        if not queues:
            return

        # Determine whether we are already on the event-loop thread.
        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None

        for queue in queues:
            if running_loop is not None:
                # We are inside the event loop – safe to put directly.
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    pass
            else:
                # Called from a sync/thread-pool context – schedule safely.
                try:
                    loop = asyncio.get_event_loop()
                    loop.call_soon_threadsafe(queue.put_nowait, event)
                except RuntimeError:
                    # No event loop available at all – drop silently.
                    pass

    async def subscribe(
        self,
        project_id: int,
        *,
        exclude_user_id: int | None = None,
    ) -> AsyncGenerator[ProjectEvent, None]:
        """
        Async generator that yields ProjectEvents for a given project.
        Blocks until an event is available. Use 'async for' to consume.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subscribers[project_id].add(queue)
        try:
            while True:
                event = await queue.get()
                # Optionally skip events from the same user (avoid echo)
                if exclude_user_id and event.actor_user_id == exclude_user_id:
                    continue
                yield event
        finally:
            self._subscribers[project_id].discard(queue)
            if not self._subscribers[project_id]:
                del self._subscribers[project_id]

    @property
    def subscriber_count(self) -> dict[int, int]:
        """Return count of subscribers per project (for monitoring)."""
        return {pid: len(qs) for pid, qs in self._subscribers.items()}


# ── Singleton ────────────────────────────────────────────────────────────────

_broker: ProjectEventBroker | None = None


def get_event_broker() -> ProjectEventBroker:
    global _broker
    if _broker is None:
        _broker = ProjectEventBroker()
    return _broker
