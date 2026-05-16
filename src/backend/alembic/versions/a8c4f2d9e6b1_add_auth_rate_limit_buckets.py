"""add auth rate limit buckets

Revision ID: a8c4f2d9e6b1
Revises: f3a9c0d2b1e8
Create Date: 2026-05-09 19:15:00.000000

"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8c4f2d9e6b1"
down_revision: str | Sequence[str] | None = "f3a9c0d2b1e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auth_rate_limit_buckets",
        sa.Column("bucket_key", sa.String(length=512), nullable=False),
        sa.Column("window_start_epoch", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("updated_at_epoch", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("bucket_key"),
    )
    op.create_index(
        "ix_auth_rate_limit_buckets_window_start_epoch",
        "auth_rate_limit_buckets",
        ["window_start_epoch"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_auth_rate_limit_buckets_window_start_epoch",
        table_name="auth_rate_limit_buckets",
    )
    op.drop_table("auth_rate_limit_buckets")
