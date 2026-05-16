"""add contract chat and block embeddings

Revision ID: 6d6ba8e1f0f2
Revises: f8d131fbc202
Create Date: 2026-04-21 09:30:00.000000

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6d6ba8e1f0f2"
down_revision: str | Sequence[str] | None = "f8d131fbc202"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.add_column(sa.Column("embedding_provider", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("embedding_vector_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("embedding_generated_at", sa.DateTime(), nullable=True))

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("draft_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["draft_id"], ["document_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_sessions_contract_id"), "chat_sessions", ["contract_id"], unique=False)
    op.create_index(op.f("ix_chat_sessions_created_by_user_id"), "chat_sessions", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_chat_sessions_draft_id"), "chat_sessions", ["draft_id"], unique=False)

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations_json", sa.Text(), nullable=True),
        sa.Column("provider_used", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_messages_session_id"), "chat_messages", ["session_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_chat_messages_session_id"), table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index(op.f("ix_chat_sessions_draft_id"), table_name="chat_sessions")
    op.drop_index(op.f("ix_chat_sessions_created_by_user_id"), table_name="chat_sessions")
    op.drop_index(op.f("ix_chat_sessions_contract_id"), table_name="chat_sessions")
    op.drop_table("chat_sessions")

    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.drop_column("embedding_generated_at")
        batch_op.drop_column("embedding_vector_json")
        batch_op.drop_column("embedding_provider")
