from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.user_notification import UserNotification
from app.models.mixins import utcnow


# ── Notification types ────────────────────────────────────────────
NOTIF_PROJECT_INVITE = "project_invite"
NOTIF_PROJECT_REMOVED = "project_removed"


def create_notification(
    session: Session,
    user_id: int,
    notification_type: str,
    title: str,
    body: str | None = None,
    project_id: int | None = None,
    project_name: str | None = None,
    actor_display_name: str | None = None,
) -> UserNotification:
    notif = UserNotification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        project_id=project_id,
        project_name=project_name,
        actor_display_name=actor_display_name,
        is_read=False,
    )
    session.add(notif)
    session.flush()
    return notif


def list_notifications_for_user(
    session: Session,
    user_id: int,
    limit: int = 50,
    unread_only: bool = False,
) -> list[UserNotification]:
    q = select(UserNotification).where(UserNotification.user_id == user_id)
    if unread_only:
        q = q.where(UserNotification.is_read == False)  # noqa: E712
    q = q.order_by(UserNotification.id.desc()).limit(limit)
    return list(session.scalars(q))


def count_unread_notifications(session: Session, user_id: int) -> int:
    return session.scalar(
        select(func.count(UserNotification.id)).where(
            UserNotification.user_id == user_id,
            UserNotification.is_read == False,  # noqa: E712
        )
    ) or 0


def get_notification_or_404(session: Session, notification_id: int, user_id: int) -> UserNotification:
    notif = session.get(UserNotification, notification_id)
    if notif is None or notif.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notif


def mark_notification_read(session: Session, notif: UserNotification) -> UserNotification:
    if not notif.is_read:
        notif.is_read = True
        notif.read_at = utcnow()
        session.add(notif)
        session.commit()
        session.refresh(notif)
    return notif


def mark_all_read(session: Session, user_id: int) -> int:
    """Mark all unread notifications as read. Returns count of updated rows."""
    now = utcnow()
    result = session.execute(
        update(UserNotification)
        .where(
            UserNotification.user_id == user_id,
            UserNotification.is_read == False,  # noqa: E712
        )
        .values(is_read=True, read_at=now)
    )
    session.commit()
    return result.rowcount
