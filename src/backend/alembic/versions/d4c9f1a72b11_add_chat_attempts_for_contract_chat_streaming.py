"""add chat attempts for contract chat streaming

Revision ID: d4c9f1a72b11
Revises: 9b4a1a2f6c31
Create Date: 2026-04-24 20:05:00.000000

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4c9f1a72b11"
down_revision: str | Sequence[str] | None = "9b4a1a2f6c31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "chat_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("draft_id", sa.Integer(), nullable=False),
        sa.Column("user_message_id", sa.Integer(), nullable=False),
        sa.Column("supersedes_attempt_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("provider_used", sa.String(length=100), nullable=True),
        sa.Column("client_request_id", sa.String(length=120), nullable=False),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("cancel_requested_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["draft_id"], ["document_versions.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"]),
        sa.ForeignKeyConstraint(["supersedes_attempt_id"], ["chat_attempts.id"]),
        sa.ForeignKeyConstraint(["user_message_id"], ["chat_messages.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "client_request_id", name="uq_chat_attempt_client_request"),
    )
    op.create_index(op.f("ix_chat_attempts_draft_id"), "chat_attempts", ["draft_id"], unique=False)
    op.create_index(op.f("ix_chat_attempts_session_id"), "chat_attempts", ["session_id"], unique=False)
    op.create_index(op.f("ix_chat_attempts_status"), "chat_attempts", ["status"], unique=False)
    op.create_index(
        op.f("ix_chat_attempts_supersedes_attempt_id"),
        "chat_attempts",
        ["supersedes_attempt_id"],
        unique=False,
    )
    op.create_index(op.f("ix_chat_attempts_user_message_id"), "chat_attempts", ["user_message_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_chat_attempts_user_message_id"), table_name="chat_attempts")
    op.drop_index(op.f("ix_chat_attempts_supersedes_attempt_id"), table_name="chat_attempts")
    op.drop_index(op.f("ix_chat_attempts_status"), table_name="chat_attempts")
    op.drop_index(op.f("ix_chat_attempts_session_id"), table_name="chat_attempts")
    op.drop_index(op.f("ix_chat_attempts_draft_id"), table_name="chat_attempts")
    op.drop_table("chat_attempts")
