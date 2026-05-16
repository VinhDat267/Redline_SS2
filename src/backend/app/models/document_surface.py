from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DocumentSurface(Base):
    __tablename__ = "document_surfaces"
    __table_args__ = (
        UniqueConstraint("parse_run_id", "surface_key", name="uq_document_surface_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    parse_run_id: Mapped[int] = mapped_column(
        ForeignKey("document_parse_runs.id"),
        nullable=False,
        index=True,
    )
    surface_type: Mapped[str] = mapped_column(String(50), nullable=False)
    surface_key: Mapped[str] = mapped_column(String(255), nullable=False)
    logical_order_index: Mapped[int] = mapped_column(nullable=False)
    section_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    parse_run = relationship("DocumentParseRun", back_populates="surfaces")
    blocks = relationship(
        "DocumentBlock",
        back_populates="surface",
        cascade="all, delete-orphan",
    )
    tables = relationship(
        "DocumentTable",
        back_populates="surface",
        cascade="all, delete-orphan",
    )
