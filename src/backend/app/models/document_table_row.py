from sqlalchemy import Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DocumentTableRow(Base):
    __tablename__ = "document_table_rows"
    __table_args__ = (
        UniqueConstraint("table_id", "row_index", name="uq_document_table_row_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(
        ForeignKey("document_tables.id"),
        nullable=False,
        index=True,
    )
    document_block_id: Mapped[int] = mapped_column(
        ForeignKey("document_blocks.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    row_key: Mapped[str] = mapped_column(Text, nullable=False)
    row_index: Mapped[int] = mapped_column(nullable=False)
    is_header_row: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    structured_row_json: Mapped[str] = mapped_column(Text, nullable=False)

    table = relationship("DocumentTable", back_populates="rows")
    document_block = relationship("DocumentBlock", back_populates="table_row")
    cells = relationship(
        "DocumentTableCell",
        back_populates="row",
        cascade="all, delete-orphan",
    )
