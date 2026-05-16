from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class TestCase(TimestampMixin, Base):
    __tablename__ = "test_cases"
    __table_args__ = (UniqueConstraint("project_id", "test_case_code", name="uq_test_case_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    test_case_code: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str | None] = mapped_column(String(100), nullable=True)

    project = relationship("Project", back_populates="test_cases")
    requirement_mappings = relationship(
        "RequirementTestCaseMapping",
        back_populates="test_case",
        cascade="all, delete-orphan",
    )
