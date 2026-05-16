from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    members = relationship(
        "ProjectMember",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    invitations = relationship(
        "ProjectInvitation",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    documents = relationship(
        "Document",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    test_cases = relationship(
        "TestCase",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    activity_logs = relationship(
        "ActivityLog",
        back_populates="project",
        cascade="all, delete-orphan",
    )
