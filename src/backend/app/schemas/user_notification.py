from datetime import datetime

from pydantic import BaseModel


class UserNotificationRead(BaseModel):
    id: int
    user_id: int
    notification_type: str
    title: str
    body: str | None = None
    is_read: bool
    read_at: datetime | None = None
    project_id: int | None = None
    project_name: str | None = None
    actor_display_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
