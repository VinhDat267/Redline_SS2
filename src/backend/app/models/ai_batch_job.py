from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class AIBatchJob(TimestampMixin, Base):
    __tablename__ = "ai_batch_jobs"
    __table_args__ = (
        Index(
            "ix_ai_batch_jobs_compare_run_active",
            "compare_run_id",
            unique=True,
            sqlite_where=text("status IN ('queued','running')"),
            postgresql_where=text("status IN ('queued','running')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    compare_run_id: Mapped[int] = mapped_column(ForeignKey("compare_runs.id"), nullable=False, index=True)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False, default="generate_ai_review_drafts")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued", index=True)
    requested_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    force_regenerate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_rag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    requested_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    compare_run = relationship("CompareRun", back_populates="ai_batch_jobs")
    requested_by = relationship(
        "User",
        foreign_keys=[requested_by_user_id],
        back_populates="requested_ai_batch_jobs",
    )
    items = relationship(
        "AIBatchJobItem",
        back_populates="job",
        cascade="all, delete-orphan",
    )
