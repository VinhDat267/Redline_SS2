from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DocumentTable(Base):
    __tablename__ = "document_tables"
    __table_args__ = (
        UniqueConstraint("parse_run_id", "table_key", name="uq_document_table_key"),
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
    surface_id: Mapped[int] = mapped_column(
        ForeignKey("document_surfaces.id"),
        nullable=False,
        index=True,
    )
    table_key: Mapped[str] = mapped_column(String(255), nullable=False)
    section_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    table_order_index: Mapped[int] = mapped_column(nullable=False)
    header_strategy: Mapped[str] = mapped_column(String(50), nullable=False)
    caption_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_caption_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    document_version = relationship("DocumentVersion", back_populates="tables")
    parse_run = relationship("DocumentParseRun", back_populates="tables")
    surface = relationship("DocumentSurface", back_populates="tables")
    columns = relationship(
        "DocumentTableColumn",
        back_populates="table",
        cascade="all, delete-orphan",
    )
    rows = relationship(
        "DocumentTableRow",
        back_populates="table",
        cascade="all, delete-orphan",
    )
