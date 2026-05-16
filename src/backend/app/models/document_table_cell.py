from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DocumentTableCell(Base):
    __tablename__ = "document_table_cells"
    __table_args__ = (
        UniqueConstraint("row_id", "column_index", name="uq_document_table_cell_column_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    row_id: Mapped[int] = mapped_column(
        ForeignKey("document_table_rows.id"),
        nullable=False,
        index=True,
    )
    column_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_table_columns.id"),
        nullable=True,
        index=True,
    )
    cell_key: Mapped[str] = mapped_column(Text, nullable=False)
    column_index: Mapped[int] = mapped_column(nullable=False)
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_content: Mapped[str] = mapped_column(Text, nullable=False)
    row_span: Mapped[int] = mapped_column(default=1, nullable=False)
    col_span: Mapped[int] = mapped_column(default=1, nullable=False)
    merge_origin_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    row = relationship("DocumentTableRow", back_populates="cells")
    column = relationship("DocumentTableColumn", back_populates="cells")
