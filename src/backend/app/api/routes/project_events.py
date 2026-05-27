"""SSE endpoint for real-time project event streaming."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.core.security import verify_access_token
from app.models import User
from app.services.project_access import ensure_project_access_or_404
from app.services.project_events import get_event_broker

router = APIRouter(tags=["project-events"])


def _get_sse_user(
    request: Request,
    token: str | None = Query(None, alias="token", description="Auth token for SSE (EventSource can't send headers)"),
    database: Session = Depends(get_db_session),
) -> User:
    """
    Resolve the current user for SSE connections.

    EventSource API cannot send custom headers or cookies cross-origin,
    so we accept the auth token as a query parameter for SSE only.
    Falls back to cookie auth for same-origin (local dev).
    """
    from app.core.security import AUTH_SESSION_COOKIE_NAME

    raw_token = token or request.cookies.get(AUTH_SESSION_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    try:
        claims = verify_access_token(raw_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user = database.get(User, claims.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if user.token_version != claims.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    return user


@router.get("/projects/{project_id}/events")
async def stream_project_events(
    project_id: int,
    request: Request,
    current_user: User = Depends(_get_sse_user),
    database: Session = Depends(get_db_session),
    echo: bool = Query(False, description="If true, include events from yourself"),
):
    """
    SSE stream of real-time project events.

    The client connects via EventSource and receives events as they happen.
    Only authenticated project members can subscribe.
    Accepts auth token via query param (EventSource can't send headers).
    """
    # Verify project membership
    ensure_project_access_or_404(database, project_id, current_user.id)

    broker = get_event_broker()
    exclude_user_id = None if echo else current_user.id

    async def combined_generator():
        """Merge event stream with keepalive heartbeats."""
        subscriber = broker.subscribe(project_id, exclude_user_id=exclude_user_id)

        # Send connected event
        yield "event: connected\ndata: {\"status\": \"connected\", \"project_id\": %d}\n\n" % project_id

        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(subscriber.__anext__(), timeout=25.0)
                    yield event.to_sse()
                except asyncio.TimeoutError:
                    # Send keepalive comment
                    yield ": keepalive\n\n"
                except StopAsyncIteration:
                    break
        except asyncio.CancelledError:
            pass
        finally:
            await subscriber.aclose()

    return StreamingResponse(
        combined_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
