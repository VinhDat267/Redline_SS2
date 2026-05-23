from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import utcnow


class CompareRun(Base):
    __tablename__ = "compare_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_version_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id"), nullable=False, index=True)
    target_version_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id"), nullable=False, index=True)
    source_parse_run_id: Mapped[int] = mapped_column(
        ForeignKey("document_parse_runs.id"),
        nullable=False,
        index=True,
    )
    target_parse_run_id: Mapped[int] = mapped_column(
        ForeignKey("document_parse_runs.id"),
        nullable=False,
        index=True,
    )
    triggered_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    compare_version: Mapped[str] = mapped_column(String(50), default="v1", nullable=False)
    compare_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    warning_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_version = relationship(
        "DocumentVersion",
        back_populates="source_compare_runs",
        foreign_keys=[source_version_id],
    )
    target_version = relationship(
        "DocumentVersion",
        back_populates="target_compare_runs",
        foreign_keys=[target_version_id],
    )
    source_parse_run = relationship(
        "DocumentParseRun",
        back_populates="source_compare_runs",
        foreign_keys=[source_parse_run_id],
    )
    target_parse_run = relationship(
        "DocumentParseRun",
        back_populates="target_compare_runs",
        foreign_keys=[target_parse_run_id],
    )
    triggered_by = relationship("User", back_populates="compare_runs")
    change_items = relationship(
        "ChangeItem",
        back_populates="compare_run",
        cascade="all, delete-orphan",
    )
    ai_batch_jobs = relationship(
        "AIBatchJob",
        back_populates="compare_run",
        cascade="all, delete-orphan",
    )
    chat_sessions = relationship(
        "ChatSession",
        back_populates="compare_run",
        cascade="all, delete-orphan",
    )
