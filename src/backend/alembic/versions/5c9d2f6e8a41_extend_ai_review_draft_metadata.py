"""extend ai review draft metadata

Revision ID: 5c9d2f6e8a41
Revises: 1a64a13bcdd8
Create Date: 2026-04-02 14:30:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c9d2f6e8a41"
down_revision: Union[str, Sequence[str], None] = "1a64a13bcdd8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ai_review_drafts") as batch_op:
        batch_op.add_column(sa.Column("provider_used", sa.String(length=50), nullable=True))
        batch_op.add_column(
            sa.Column(
                "fallback_used",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.add_column(sa.Column("error_message", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ai_review_drafts") as batch_op:
        batch_op.drop_column("error_message")
        batch_op.drop_column("fallback_used")
        batch_op.drop_column("provider_used")
