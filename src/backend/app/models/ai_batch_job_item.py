from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class AIBatchJobItem(TimestampMixin, Base):
    __tablename__ = "ai_batch_job_items"
    __table_args__ = (UniqueConstraint("job_id", "change_item_id", name="uq_ai_batch_job_item"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("ai_batch_jobs.id"), nullable=False, index=True)
    change_item_id: Mapped[int] = mapped_column(ForeignKey("change_items.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued", index=True)
    provider_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fallback_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    job = relationship("AIBatchJob", back_populates="items")
    change_item = relationship("ChangeItem", back_populates="ai_batch_job_items")
