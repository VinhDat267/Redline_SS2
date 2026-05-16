from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import utcnow


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version_label", name="uq_document_version_label"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    version_label: Mapped[str] = mapped_column(String(100), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    parse_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    active_parse_run_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "document_parse_runs.id",
            use_alter=True,
            name="fk_document_versions_active_parse_run_id",
        ),
        nullable=True,
        index=True,
    )
    parsed_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    document = relationship("Document", back_populates="versions")
    uploaded_by = relationship("User", back_populates="uploaded_versions")
    blocks = relationship(
        "DocumentBlock",
        back_populates="document_version",
        cascade="all, delete-orphan",
    )
    parse_runs = relationship(
        "DocumentParseRun",
        back_populates="document_version",
        cascade="all, delete-orphan",
        foreign_keys="DocumentParseRun.document_version_id",
    )
    active_parse_run = relationship(
        "DocumentParseRun",
        foreign_keys=[active_parse_run_id],
        post_update=True,
    )
    tables = relationship(
        "DocumentTable",
        back_populates="document_version",
        cascade="all, delete-orphan",
    )
    source_compare_runs = relationship(
        "CompareRun",
        back_populates="source_version",
        foreign_keys="CompareRun.source_version_id",
    )
    target_compare_runs = relationship(
        "CompareRun",
        back_populates="target_version",
        foreign_keys="CompareRun.target_version_id",
    )
    source_change_items = relationship(
        "ChangeItem",
        back_populates="source_version",
        foreign_keys="ChangeItem.source_version_id",
    )
    target_change_items = relationship(
        "ChangeItem",
        back_populates="target_version",
        foreign_keys="ChangeItem.target_version_id",
    )
    requirement_candidates = relationship(
        "AIRequirementCandidate",
        back_populates="document_version",
        cascade="all, delete-orphan",
    )
    chat_sessions = relationship(
        "ChatSession",
        back_populates="draft",
        cascade="all, delete-orphan",
    )
    chat_attempts = relationship(
        "ChatAttempt",
        back_populates="draft",
        cascade="all, delete-orphan",
    )

    @property
    def uploaded_by_display_name(self) -> str | None:
        return self.uploaded_by.display_name if self.uploaded_by is not None else None

    @property
    def warning_count(self) -> int:
        return self.active_parse_run.warning_count if self.active_parse_run is not None else 0

    @property
    def parser_version(self) -> str | None:
        return self.active_parse_run.parser_version if self.active_parse_run is not None else None
