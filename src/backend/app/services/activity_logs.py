"""Activity log service for recording and querying project activity."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog


def record(
    session: Session,
    *,
    project_id: int,
    user_id: int,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    description: str,
) -> ActivityLog:
    """Create an activity log entry. Commits immediately."""
    entry = ActivityLog(
        project_id=project_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def list_activity_logs(
    session: Session,
    project_id: int,
    *,
    limit: int = 50,
) -> list[dict]:
    """Return the most recent activity logs for a project, newest first."""
    rows = session.execute(
        select(ActivityLog)
        .where(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    ).scalars().all()

    return [
        {
            "id": row.id,
            "project_id": row.project_id,
            "user_id": row.user_id,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "description": row.description,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
