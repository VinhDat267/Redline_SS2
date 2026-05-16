from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.mixins import TimestampMixin


ACTIVE_CHAT_ATTEMPT_STATUSES = (
    "starting",
    "grounding",
    "answering",
    "sources_pending",
    "cancelling",
)
ACTIVE_CHAT_ATTEMPT_STATUS_SQL = "status IN ('starting','grounding','answering','sources_pending','cancelling')"


class ChatAttempt(TimestampMixin, Base):
    __tablename__ = "chat_attempts"
    __table_args__ = (
        UniqueConstraint("session_id", "client_request_id", name="uq_chat_attempt_client_request"),
        Index(
            "ix_chat_attempts_session_active_unique",
            "session_id",
            unique=True,
            sqlite_where=text(ACTIVE_CHAT_ATTEMPT_STATUS_SQL),
            postgresql_where=text(ACTIVE_CHAT_ATTEMPT_STATUS_SQL),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False, index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id"), nullable=False, index=True)
    user_message_id: Mapped[int] = mapped_column(ForeignKey("chat_messages.id"), nullable=False, index=True)
    supersedes_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("chat_attempts.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(40), default="starting", nullable=False, index=True)
    provider_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    client_request_id: Mapped[str] = mapped_column(String(120), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    session = relationship("ChatSession", back_populates="attempts")
    draft = relationship("DocumentVersion", back_populates="chat_attempts")
    user_message = relationship("ChatMessage", foreign_keys=[user_message_id])
    supersedes_attempt = relationship("ChatAttempt", remote_side=[id])
