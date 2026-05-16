from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


class ChatSession(TimestampMixin, Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id"), nullable=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    contract = relationship("Document", back_populates="chat_sessions")
    draft = relationship("DocumentVersion", back_populates="chat_sessions")
    created_by = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    attempts = relationship("ChatAttempt", back_populates="session", cascade="all, delete-orphan")
