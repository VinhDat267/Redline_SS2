"""scope document block keys to parse run

Revision ID: c76f8a2d1b44
Revises: a61f4d9c2e83
Create Date: 2026-04-25 23:45:00.000000

"""

from typing import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c76f8a2d1b44"
down_revision: str | Sequence[str] | None = "a61f4d9c2e83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.drop_constraint("uq_document_block_key", type_="unique")
        batch_op.create_unique_constraint(
            "uq_document_block_parse_run_key",
            ["parse_run_id", "block_key"],
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.drop_constraint("uq_document_block_parse_run_key", type_="unique")
        batch_op.create_unique_constraint(
            "uq_document_block_key",
            ["document_version_id", "block_key"],
        )
