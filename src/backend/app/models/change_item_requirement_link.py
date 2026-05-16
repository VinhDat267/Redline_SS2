from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import utcnow


class ChangeItemRequirementLink(Base):
    __tablename__ = "change_item_requirement_links"
    __table_args__ = (UniqueConstraint("change_item_id", "requirement_id", name="uq_change_item_requirement"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    change_item_id: Mapped[int] = mapped_column(ForeignKey("change_items.id"), nullable=False, index=True)
    requirement_id: Mapped[int] = mapped_column(ForeignKey("requirements.id"), nullable=False, index=True)
    link_type: Mapped[str] = mapped_column(String(50), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)

    change_item = relationship("ChangeItem", back_populates="requirement_links")
    requirement = relationship("Requirement", back_populates="change_links")
