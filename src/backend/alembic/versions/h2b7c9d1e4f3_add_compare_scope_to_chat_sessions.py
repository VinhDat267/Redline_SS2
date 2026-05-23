"""add compare scope to chat sessions

Revision ID: h2b7c9d1e4f3
Revises: b9e3d4c5a6f7
Create Date: 2026-05-23 19:30:00.000000

"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "h2b7c9d1e4f3"
down_revision: str | Sequence[str] | None = "b9e3d4c5a6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.add_column(sa.Column("compare_run_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_chat_sessions_compare_run_id", ["compare_run_id"])
        batch_op.create_foreign_key(
            "fk_chat_sessions_compare_run_id_compare_runs",
            "compare_runs",
            ["compare_run_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.drop_constraint("fk_chat_sessions_compare_run_id_compare_runs", type_="foreignkey")
        batch_op.drop_index("ix_chat_sessions_compare_run_id")
        batch_op.drop_column("compare_run_id")
