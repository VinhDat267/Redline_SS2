"""add review status check constraint to change_items

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-05-28 09:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'j4k5l6m7n8o9'
down_revision = 'i3j4k5l6m7n8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.create_check_constraint(
            "ck_change_items_review_status",
            "change_items",
            "review_status IN ('open', 'in_review', 'resolved')"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("ck_change_items_review_status", "change_items", type_="check")
