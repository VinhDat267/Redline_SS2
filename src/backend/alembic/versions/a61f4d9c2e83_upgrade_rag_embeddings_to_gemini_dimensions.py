"""upgrade rag embeddings to gemini dimensions

Revision ID: a61f4d9c2e83
Revises: e7b5c3a41d29
Create Date: 2026-04-25 10:30:00.000000

"""

from typing import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a61f4d9c2e83"
down_revision: str | Sequence[str] | None = "e7b5c3a41d29"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        """
        UPDATE document_blocks
        SET embedding_vector = NULL,
            embedding_vector_json = NULL,
            embedding_provider = NULL,
            embedding_generated_at = NULL
        """
    )
    op.execute(
        """
        ALTER TABLE document_blocks
        ALTER COLUMN embedding_vector TYPE vector(3072)
        USING NULL::vector(3072)
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        """
        UPDATE document_blocks
        SET embedding_vector = NULL,
            embedding_vector_json = NULL,
            embedding_provider = NULL,
            embedding_generated_at = NULL
        """
    )
    op.execute(
        """
        ALTER TABLE document_blocks
        ALTER COLUMN embedding_vector TYPE vector(64)
        USING NULL::vector(64)
        """
    )
