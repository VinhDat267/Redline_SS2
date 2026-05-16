"""add activity logs

Revision ID: f8d131fbc202
Revises: c3f29e7a9d10
Create Date: 2026-04-16 13:59:14.151457

"""
from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f8d131fbc202"
down_revision: str | Sequence[str] | None = "c3f29e7a9d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_logs_created_at", "activity_logs", ["created_at"], unique=False)
    op.create_index("ix_activity_logs_project_id", "activity_logs", ["project_id"], unique=False)
    op.drop_index(op.f("ix_document_table_rows_document_block_id"), table_name="document_table_rows")
    op.create_index(
        op.f("ix_document_table_rows_document_block_id"),
        "document_table_rows",
        ["document_block_id"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_document_table_rows_document_block_id"), table_name="document_table_rows")
    op.create_index(
        op.f("ix_document_table_rows_document_block_id"),
        "document_table_rows",
        ["document_block_id"],
        unique=False,
    )
    op.drop_index("ix_activity_logs_project_id", table_name="activity_logs")
    op.drop_index("ix_activity_logs_created_at", table_name="activity_logs")
    op.drop_table("activity_logs")
