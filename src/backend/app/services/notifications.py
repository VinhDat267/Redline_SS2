from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.user_notification import UserNotification
from app.models.project_member import ProjectMember
from app.models.mixins import utcnow


# ── Notification types ────────────────────────────────────────────
NOTIF_PROJECT_INVITE = "project_invite"
NOTIF_PROJECT_REMOVED = "project_removed"
NOTIF_DOCUMENT_UPLOADED = "document_uploaded"
NOTIF_VERSION_UPLOADED = "version_uploaded"
NOTIF_COMPARE_STARTED = "compare_started"
NOTIF_COMPARE_COMPLETED = "compare_completed"
NOTIF_REVIEW_COMMENT = "review_comment"
NOTIF_CHANGE_REVIEWED = "change_reviewed"
NOTIF_CHANGE_ASSIGNED = "change_assigned"
NOTIF_CHANGE_UPDATED = "change_updated"
NOTIF_REQUIREMENT_CREATED = "requirement_created"
NOTIF_REQUIREMENT_UPDATED = "requirement_updated"
NOTIF_REQUIREMENT_DELETED = "requirement_deleted"
NOTIF_TEST_CASE_CREATED = "test_case_created"
NOTIF_TEST_CASE_UPDATED = "test_case_updated"
NOTIF_TEST_CASE_DELETED = "test_case_deleted"


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


def notify_project_members(
    session: Session,
    project_id: int,
    actor_user_id: int,
    notification_type: str,
    title: str,
    body: str | None = None,
    project_name: str | None = None,
    actor_display_name: str | None = None,
    exclude_user_ids: list[int] | None = None,
) -> list[UserNotification]:
    """Create a notification for every project member except the actor.

    exclude_user_ids: additional user IDs to skip (e.g. users already notified
    via a targeted create_notification call, to avoid duplicate alerts).
    """
    excluded = set(exclude_user_ids or [])
    member_user_ids = list(session.scalars(
        select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id != actor_user_id,
        )
    ))
    member_user_ids = [uid for uid in member_user_ids if uid not in excluded]
    notifications = []
    for uid in member_user_ids:
        notif = create_notification(
            session,
            user_id=uid,
            notification_type=notification_type,
            title=title,
            body=body,
            project_id=project_id,
            project_name=project_name,
            actor_display_name=actor_display_name,
        )
        notifications.append(notif)
    return notifications


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
