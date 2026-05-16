from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.vector_config import EMBEDDING_DIMENSIONS
from app.models.base import Base
from app.models.mixins import utcnow
from app.models.types import EmbeddingVectorType


class DocumentBlock(Base):
    __tablename__ = "document_blocks"
    __table_args__ = (UniqueConstraint("parse_run_id", "block_key", name="uq_document_block_parse_run_key"),)

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
    surface_id: Mapped[int] = mapped_column(
        ForeignKey("document_surfaces.id"),
        nullable=False,
        index=True,
    )
    block_key: Mapped[str] = mapped_column(String(255), nullable=False)
    block_type: Mapped[str] = mapped_column(String(100), nullable=False)
    section_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    heading_level: Mapped[int | None] = mapped_column(nullable=True)
    order_index: Mapped[int] = mapped_column(nullable=False)
    surface_order_index: Mapped[int] = mapped_column(nullable=False)
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedding_vector: Mapped[list[float] | None] = mapped_column(
        EmbeddingVectorType(EMBEDDING_DIMENSIONS),
        nullable=True,
    )
    embedding_vector_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=utcnow)

    document_version = relationship("DocumentVersion", back_populates="blocks")
    parse_run = relationship("DocumentParseRun", back_populates="blocks")
    surface = relationship("DocumentSurface", back_populates="blocks")
    table_row = relationship(
        "DocumentTableRow",
        back_populates="document_block",
        uselist=False,
    )
    source_change_items = relationship(
        "ChangeItem",
        back_populates="source_block",
        foreign_keys="ChangeItem.source_block_id",
    )
    target_change_items = relationship(
        "ChangeItem",
        back_populates="target_block",
        foreign_keys="ChangeItem.target_block_id",
    )
    requirement_candidates = relationship(
        "AIRequirementCandidate",
        back_populates="document_block",
    )
