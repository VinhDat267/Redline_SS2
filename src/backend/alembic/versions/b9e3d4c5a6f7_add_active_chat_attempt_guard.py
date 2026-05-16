"""add active chat attempt guard

Revision ID: b9e3d4c5a6f7
Revises: g1a2b3c4d5e6
Create Date: 2026-05-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "b9e3d4c5a6f7"
down_revision = "g1a2b3c4d5e6"
branch_labels = None
depends_on = None


ACTIVE_CHAT_ATTEMPT_STATUS_SQL = (
    "status IN ('starting','grounding','answering','sources_pending','cancelling')"
)


def upgrade() -> None:
    op.create_index(
        "ix_chat_attempts_session_active_unique",
        "chat_attempts",
        ["session_id"],
        unique=True,
        sqlite_where=sa.text(ACTIVE_CHAT_ATTEMPT_STATUS_SQL),
        postgresql_where=sa.text(ACTIVE_CHAT_ATTEMPT_STATUS_SQL),
    )


def downgrade() -> None:
    op.drop_index("ix_chat_attempts_session_active_unique", table_name="chat_attempts")
