from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class ProjectInvitation(TimestampMixin, Base):
    __tablename__ = "project_invitations"
    __table_args__ = (UniqueConstraint("project_id", "email", name="uq_project_invitation_email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    invited_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project = relationship("Project", back_populates="invitations")
    invited_by = relationship("User", back_populates="sent_project_invitations")

    @property
    def project_name(self) -> str | None:
        return self.project.name if self.project is not None else None

    @property
    def invited_by_display_name(self) -> str | None:
        return self.invited_by.display_name if self.invited_by is not None else None
