"""add project invitations

Revision ID: b2a19f4c4d3d
Revises: 8f1c2d4b6a70
Create Date: 2026-04-09 17:05:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2a19f4c4d3d"
down_revision: Union[str, Sequence[str], None] = "8f1c2d4b6a70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_invitations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "email", name="uq_project_invitation_email"),
    )
    op.create_index("ix_project_invitations_email", "project_invitations", ["email"], unique=False)
    op.create_index("ix_project_invitations_invited_by_user_id", "project_invitations", ["invited_by_user_id"], unique=False)
    op.create_index("ix_project_invitations_project_id", "project_invitations", ["project_id"], unique=False)
    op.create_index("ix_project_invitations_status", "project_invitations", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_project_invitations_status", table_name="project_invitations")
    op.drop_index("ix_project_invitations_project_id", table_name="project_invitations")
    op.drop_index("ix_project_invitations_invited_by_user_id", table_name="project_invitations")
    op.drop_index("ix_project_invitations_email", table_name="project_invitations")
    op.drop_table("project_invitations")
