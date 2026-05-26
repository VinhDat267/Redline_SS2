from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.user_notification import UserNotificationRead
from app.services import notifications as notification_service

router = APIRouter(tags=["notifications"], dependencies=[Depends(get_current_user)])


@router.get("/notifications")
def list_notifications(
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    notifs = notification_service.list_notifications_for_user(
        database, current_user.id, limit=50, unread_only=unread_only
    )
    unread_count = notification_service.count_unread_notifications(database, current_user.id)
    return {
        "data": {
            "items": [UserNotificationRead.model_validate(n).model_dump(mode="json") for n in notifs],
            "unread_count": unread_count,
        }
    }


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    notif = notification_service.get_notification_or_404(database, notification_id, current_user.id)
    notif = notification_service.mark_notification_read(database, notif)
    return {"data": UserNotificationRead.model_validate(notif).model_dump(mode="json")}


@router.post("/notifications/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    count = notification_service.mark_all_read(database, current_user.id)
    return {"data": {"marked_read": count}}
