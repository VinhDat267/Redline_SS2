from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import utcnow


class RequirementTestCaseMapping(Base):
    __tablename__ = "requirement_test_case_mappings"
    __table_args__ = (UniqueConstraint("requirement_id", "test_case_id", name="uq_requirement_test_case"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    requirement_id: Mapped[int] = mapped_column(ForeignKey("requirements.id"), nullable=False, index=True)
    test_case_id: Mapped[int] = mapped_column(ForeignKey("test_cases.id"), nullable=False, index=True)
    mapping_type: Mapped[str] = mapped_column(String(50), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)

    requirement = relationship("Requirement", back_populates="test_case_mappings")
    test_case = relationship("TestCase", back_populates="requirement_mappings")
