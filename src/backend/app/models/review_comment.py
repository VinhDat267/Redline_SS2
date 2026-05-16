from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class ReviewComment(TimestampMixin, Base):
    __tablename__ = "review_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    change_item_id: Mapped[int] = mapped_column(ForeignKey("change_items.id"), nullable=False, index=True)
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    change_item = relationship("ChangeItem", back_populates="review_comments")
    author = relationship("User", back_populates="review_comments")

    @property
    def author_display_name(self) -> str | None:
        return self.author.display_name if self.author is not None else None
