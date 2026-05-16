from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avatar_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)

    @property
    def google_linked(self) -> bool:
        return bool(self.google_sub)

    @property
    def avatar_url(self) -> str | None:
        return f"/uploads/avatars/{self.avatar_path}" if self.avatar_path else None

    project_memberships = relationship("ProjectMember", back_populates="user")
    sent_project_invitations = relationship(
        "ProjectInvitation",
        back_populates="invited_by",
        foreign_keys="ProjectInvitation.invited_by_user_id",
    )
    uploaded_versions = relationship("DocumentVersion", back_populates="uploaded_by")
    compare_runs = relationship("CompareRun", back_populates="triggered_by")
    assigned_change_items = relationship(
        "ChangeItem",
        back_populates="assignee",
        foreign_keys="ChangeItem.assignee_user_id",
    )
    suggested_ai_review_drafts = relationship(
        "AIReviewDraft",
        back_populates="suggested_assignee",
        foreign_keys="AIReviewDraft.suggested_assignee_user_id",
    )
    requested_ai_batch_jobs = relationship(
        "AIBatchJob",
        foreign_keys="AIBatchJob.requested_by_user_id",
        back_populates="requested_by",
    )
    review_comments = relationship("ReviewComment", back_populates="author")
    chat_sessions = relationship("ChatSession", back_populates="created_by")
