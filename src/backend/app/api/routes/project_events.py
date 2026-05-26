"""SSE endpoint for real-time project event streaming."""

import asyncio

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.services.project_access import ensure_project_access_or_404
from app.services.project_events import get_event_broker

router = APIRouter(tags=["project-events"])


@router.get("/projects/{project_id}/events")
async def stream_project_events(
    project_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
    echo: bool = Query(False, description="If true, include events from yourself"),
):
    """
    SSE stream of real-time project events.

    The client connects via EventSource and receives events as they happen.
    Only authenticated project members can subscribe.
    """
    # Verify project membership
    ensure_project_access_or_404(database, project_id, current_user.id)

    broker = get_event_broker()
    exclude_user_id = None if echo else current_user.id

    async def event_generator():
        # Send initial connection event
        yield "event: connected\ndata: {\"status\": \"connected\", \"project_id\": %d}\n\n" % project_id

        # Send keepalive every 25 seconds to prevent timeout
        async def keepalive():
            while True:
                await asyncio.sleep(25)
                yield ": keepalive\n\n"

        keepalive_gen = keepalive()

        try:
            async for event in broker.subscribe(
                project_id=project_id,
                exclude_user_id=exclude_user_id,
            ):
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                yield event.to_sse()
        except asyncio.CancelledError:
            pass

    async def combined_generator():
        """Merge event stream with keepalive heartbeats."""
        broker = get_event_broker()
        exclude_user_id = None if echo else current_user.id
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)

        broker._subscribers[project_id].add(queue)

        # Send connected event
        yield "event: connected\ndata: {\"status\": \"connected\", \"project_id\": %d}\n\n" % project_id

        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                    if exclude_user_id and event.actor_user_id == exclude_user_id:
                        continue
                    yield event.to_sse()
                except asyncio.TimeoutError:
                    # Send keepalive comment
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broker._subscribers[project_id].discard(queue)
            if not broker._subscribers[project_id]:
                del broker._subscribers[project_id]

    return StreamingResponse(
        combined_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
