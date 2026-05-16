"""add use_rag to ai batch jobs

Revision ID: e7b5c3a41d29
Revises: d4c9f1a72b11
Create Date: 2026-04-24 23:30:00.000000

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e7b5c3a41d29"
down_revision: str | Sequence[str] | None = "d4c9f1a72b11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "ai_batch_jobs",
        sa.Column("use_rag", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("ai_batch_jobs", "use_rag")
