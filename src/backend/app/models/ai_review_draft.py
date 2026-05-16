from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import utcnow


class AIReviewDraft(Base):
    __tablename__ = "ai_review_drafts"
    __table_args__ = (UniqueConstraint("change_item_id", name="uq_change_item_ai_review_draft"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    change_item_id: Mapped[int] = mapped_column(ForeignKey("change_items.id"), nullable=False, index=True)
    suggested_assignee_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    recommended_review_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    risk_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    draft_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_checks: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    generation_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False, index=True)
    provider_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    change_item = relationship("ChangeItem", back_populates="ai_review_draft")
    suggested_assignee = relationship(
        "User",
        back_populates="suggested_ai_review_drafts",
        foreign_keys=[suggested_assignee_user_id],
    )
