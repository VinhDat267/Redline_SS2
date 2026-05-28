from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class ChangeItem(TimestampMixin, Base):
    __tablename__ = "change_items"
    __table_args__ = (
        CheckConstraint(
            "review_status IN ('open','in_review','resolved')",
            name="ck_change_items_review_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    compare_run_id: Mapped[int] = mapped_column(ForeignKey("compare_runs.id"), nullable=False, index=True)
    source_version_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id"), nullable=False, index=True)
    target_version_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id"), nullable=False, index=True)
    source_block_id: Mapped[int | None] = mapped_column(ForeignKey("document_blocks.id"), nullable=True, index=True)
    target_block_id: Mapped[int | None] = mapped_column(ForeignKey("document_blocks.id"), nullable=True, index=True)
    change_type: Mapped[str] = mapped_column(String(50), nullable=False)
    section_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    surface_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    surface_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    container_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    container_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    table_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    row_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    old_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_context_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_diff_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(String(50), default="open", nullable=False, index=True)
    assignee_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    compare_run = relationship("CompareRun", back_populates="change_items")
    source_version = relationship(
        "DocumentVersion",
        back_populates="source_change_items",
        foreign_keys=[source_version_id],
    )
    target_version = relationship(
        "DocumentVersion",
        back_populates="target_change_items",
        foreign_keys=[target_version_id],
    )
    source_block = relationship(
        "DocumentBlock",
        back_populates="source_change_items",
        foreign_keys=[source_block_id],
    )
    target_block = relationship(
        "DocumentBlock",
        back_populates="target_change_items",
        foreign_keys=[target_block_id],
    )
    assignee = relationship(
        "User",
        back_populates="assigned_change_items",
        foreign_keys=[assignee_user_id],
    )
    ai_review_draft = relationship(
        "AIReviewDraft",
        back_populates="change_item",
        cascade="all, delete-orphan",
        uselist=False,
    )
    ai_batch_job_items = relationship(
        "AIBatchJobItem",
        back_populates="change_item",
        cascade="all, delete-orphan",
    )
    review_comments = relationship(
        "ReviewComment",
        back_populates="change_item",
        cascade="all, delete-orphan",
    )
    requirement_links = relationship(
        "ChangeItemRequirementLink",
        back_populates="change_item",
        cascade="all, delete-orphan",
    )

    @property
    def assignee_display_name(self) -> str | None:
        return self.assignee.display_name if self.assignee is not None else None

    @property
    def ai_generation_status(self) -> str:
        return self.ai_review_draft.generation_status if self.ai_review_draft else "not_requested"
