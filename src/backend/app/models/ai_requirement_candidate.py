from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import utcnow


class AIRequirementCandidate(Base):
    __tablename__ = "ai_requirement_candidates"
    __table_args__ = (
        UniqueConstraint(
            "document_version_id",
            "parse_run_id",
            "requirement_code",
            "source_block_key",
            name="uq_ai_requirement_candidate_source",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_version_id: Mapped[int] = mapped_column(
        ForeignKey("document_versions.id"),
        nullable=False,
        index=True,
    )
    parse_run_id: Mapped[int] = mapped_column(
        ForeignKey("document_parse_runs.id"),
        nullable=False,
        index=True,
    )
    document_block_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_blocks.id"),
        nullable=True,
        index=True,
    )
    accepted_requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("requirements.id"),
        nullable=True,
        index=True,
    )
    requirement_code: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_section: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_block_key: Mapped[str] = mapped_column(String(255), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False, index=True)
    provider_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_ai_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    document_version = relationship("DocumentVersion", back_populates="requirement_candidates")
    parse_run = relationship("DocumentParseRun", back_populates="requirement_candidates")
    document_block = relationship("DocumentBlock", back_populates="requirement_candidates")
    accepted_requirement = relationship("Requirement", back_populates="ai_candidates")
