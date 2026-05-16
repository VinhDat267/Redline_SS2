from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DocumentTableColumn(Base):
    __tablename__ = "document_table_columns"
    __table_args__ = (
        UniqueConstraint("table_id", "column_key", name="uq_document_table_column_key"),
        UniqueConstraint("table_id", "column_index", name="uq_document_table_column_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(
        ForeignKey("document_tables.id"),
        nullable=False,
        index=True,
    )
    column_key: Mapped[str] = mapped_column(String(255), nullable=False)
    column_index: Mapped[int] = mapped_column(nullable=False)
    header_text: Mapped[str] = mapped_column(String(1000), nullable=False)
    normalized_header_text: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(50), nullable=False)

    table = relationship("DocumentTable", back_populates="columns")
    cells = relationship("DocumentTableCell", back_populates="column")
