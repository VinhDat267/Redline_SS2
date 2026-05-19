from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import utcnow


class DocumentParseRun(Base):
    __tablename__ = "document_parse_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_version_id: Mapped[int] = mapped_column(
        ForeignKey("document_versions.id"),
        nullable=False,
        index=True,
    )
    parser_version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    warning_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    document_version = relationship(
        "DocumentVersion",
        back_populates="parse_runs",
        foreign_keys=[document_version_id],
    )
    surfaces = relationship(
        "DocumentSurface",
        back_populates="parse_run",
        cascade="all, delete-orphan",
    )
    blocks = relationship(
        "DocumentBlock",
        back_populates="parse_run",
        cascade="all, delete-orphan",
    )
    tables = relationship(
        "DocumentTable",
        back_populates="parse_run",
        cascade="all, delete-orphan",
    )
    source_compare_runs = relationship(
        "CompareRun",
        back_populates="source_parse_run",
        foreign_keys="CompareRun.source_parse_run_id",
        cascade="all, delete",
    )
    target_compare_runs = relationship(
        "CompareRun",
        back_populates="target_parse_run",
        foreign_keys="CompareRun.target_parse_run_id",
        cascade="all, delete",
    )
    requirement_candidates = relationship(
        "AIRequirementCandidate",
        back_populates="parse_run",
        cascade="all, delete-orphan",
    )
