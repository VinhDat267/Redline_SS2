from datetime import datetime

from app.schemas.common import ReadModel


class ProjectInvitationRead(ReadModel):
    id: int
    project_id: int
    email: str
    role: str | None = None
    status: str
    invited_by_user_id: int | None = None
    invited_by_display_name: str | None = None
    project_name: str | None = None
    created_at: datetime
    updated_at: datetime
    accepted_at: datetime | None = None
