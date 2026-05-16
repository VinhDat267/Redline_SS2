"""add user avatar_path

Revision ID: g1a2b3c4d5e6
Revises: f8d131fbc202
Create Date: 2026-05-10 09:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "g1a2b3c4d5e6"
down_revision = "a8c4f2d9e6b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_path", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_path")
