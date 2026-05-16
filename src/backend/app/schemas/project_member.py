from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import ReadModel
from app.schemas.project_invitation import ProjectInvitationRead


class ProjectMemberCreate(BaseModel):
    user_id: int | None = None
    user_email: str | None = None
    user_display_name: str | None = None
    role: str | None = None


class ProjectMemberUpdate(BaseModel):
    role: str | None = None


class ProjectMemberRead(ReadModel):
    id: int
    project_id: int
    user_id: int
    role: str | None = None
    joined_at: datetime
    user_display_name: str | None = None
    user_email: str | None = None


class ProjectMemberCreateResultRead(BaseModel):
    result_type: Literal["member_added", "invitation_created"]
    member: ProjectMemberRead | None = None
    invitation: ProjectInvitationRead | None = None
    message: str | None = None
