"""add user token version

Revision ID: f3a9c0d2b1e8
Revises: e5b7c1a9d2f4
Create Date: 2026-05-09 18:30:00.000000

"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a9c0d2b1e8"
down_revision: str | Sequence[str] | None = "e5b7c1a9d2f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("token_version", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("token_version")
