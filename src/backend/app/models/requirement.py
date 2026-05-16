from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class Requirement(TimestampMixin, Base):
    __tablename__ = "requirements"
    __table_args__ = (UniqueConstraint("document_id", "requirement_code", name="uq_requirement_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    requirement_code: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_section: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_block_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str | None] = mapped_column(String(100), nullable=True)

    document = relationship("Document", back_populates="requirements")
    change_links = relationship(
        "ChangeItemRequirementLink",
        back_populates="requirement",
        cascade="all, delete-orphan",
    )
    test_case_mappings = relationship(
        "RequirementTestCaseMapping",
        back_populates="requirement",
        cascade="all, delete-orphan",
    )
    ai_candidates = relationship(
        "AIRequirementCandidate",
        back_populates="accepted_requirement",
    )
