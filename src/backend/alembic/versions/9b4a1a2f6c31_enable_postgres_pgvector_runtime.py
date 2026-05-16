"""enable postgres pgvector runtime

Revision ID: 9b4a1a2f6c31
Revises: 6d6ba8e1f0f2
Create Date: 2026-04-22 09:20:00.000000

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import VECTOR


# revision identifiers, used by Alembic.
revision: str = "9b4a1a2f6c31"
down_revision: str | Sequence[str] | None = "6d6ba8e1f0f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        op.add_column("document_blocks", sa.Column("embedding_vector", VECTOR(64), nullable=True))
        return

    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.add_column(sa.Column("embedding_vector", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        op.drop_column("document_blocks", "embedding_vector")
        return

    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.drop_column("embedding_vector")
