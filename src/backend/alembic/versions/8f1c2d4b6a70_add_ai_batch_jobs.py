"""add ai batch jobs

Revision ID: 8f1c2d4b6a70
Revises: 5c9d2f6e8a41
Create Date: 2026-04-02 19:20:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8f1c2d4b6a70"
down_revision: Union[str, Sequence[str], None] = "5c9d2f6e8a41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_batch_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("compare_run_id", sa.Integer(), nullable=False),
        sa.Column("job_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("processed_count", sa.Integer(), nullable=False),
        sa.Column("generated_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("force_regenerate", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["compare_run_id"], ["compare_runs.id"]),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_batch_jobs_compare_run_id", "ai_batch_jobs", ["compare_run_id"], unique=False)
    op.create_index("ix_ai_batch_jobs_requested_by_user_id", "ai_batch_jobs", ["requested_by_user_id"], unique=False)
    op.create_index("ix_ai_batch_jobs_status", "ai_batch_jobs", ["status"], unique=False)
    op.create_index(
        "ix_ai_batch_jobs_compare_run_active",
        "ai_batch_jobs",
        ["compare_run_id"],
        unique=True,
        sqlite_where=sa.text("status IN ('queued','running')"),
        postgresql_where=sa.text("status IN ('queued','running')"),
    )

    op.create_table(
        "ai_batch_job_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("change_item_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("provider_used", sa.String(length=50), nullable=True),
        sa.Column("fallback_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["change_item_id"], ["change_items.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["ai_batch_jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "change_item_id", name="uq_ai_batch_job_item"),
    )
    op.create_index("ix_ai_batch_job_items_change_item_id", "ai_batch_job_items", ["change_item_id"], unique=False)
    op.create_index("ix_ai_batch_job_items_job_id", "ai_batch_job_items", ["job_id"], unique=False)
    op.create_index("ix_ai_batch_job_items_status", "ai_batch_job_items", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_batch_job_items_status", table_name="ai_batch_job_items")
    op.drop_index("ix_ai_batch_job_items_job_id", table_name="ai_batch_job_items")
    op.drop_index("ix_ai_batch_job_items_change_item_id", table_name="ai_batch_job_items")
    op.drop_table("ai_batch_job_items")

    op.drop_index("ix_ai_batch_jobs_compare_run_active", table_name="ai_batch_jobs")
    op.drop_index("ix_ai_batch_jobs_status", table_name="ai_batch_jobs")
    op.drop_index("ix_ai_batch_jobs_requested_by_user_id", table_name="ai_batch_jobs")
    op.drop_index("ix_ai_batch_jobs_compare_run_id", table_name="ai_batch_jobs")
    op.drop_table("ai_batch_jobs")
