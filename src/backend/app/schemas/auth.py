from datetime import datetime
import re

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ReadModel
from app.schemas.project_invitation import ProjectInvitationRead
from app.schemas.project_member import ProjectMemberRead


EMAIL_MAX_LENGTH = 255
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def validate_email(value: str) -> str:
    email = value.strip()
    if not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Invalid email address")
    return email


class AuthRegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=EMAIL_MAX_LENGTH)
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email_address(cls, value: str) -> str:
        return validate_email(value)


class AuthLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=EMAIL_MAX_LENGTH)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email_address(cls, value: str) -> str:
        return validate_email(value)


class AuthGoogleRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=8192)


class UserProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)


class UserPasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserRead(ReadModel):
    id: int
    email: str
    display_name: str
    has_password: bool
    google_linked: bool
    is_active: bool
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime


class AuthSessionRead(BaseModel):
    csrf_token: str
    user: UserRead
    pending_project_invitations: list[ProjectInvitationRead] = Field(default_factory=list)


class PendingProjectInvitationAcceptanceRead(BaseModel):
    member: ProjectMemberRead
    pending_project_invitations: list[ProjectInvitationRead] = Field(default_factory=list)


class UserPasswordChangeRead(BaseModel):
    user: UserRead
    csrf_token: str
