"""add ai requirement candidates

Revision ID: c3f29e7a9d10
Revises: b2a19f4c4d3d
Create Date: 2026-04-16 10:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f29e7a9d10"
down_revision: Union[str, None] = "b2a19f4c4d3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_requirement_candidates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_version_id", sa.Integer(), nullable=False),
        sa.Column("parse_run_id", sa.Integer(), nullable=False),
        sa.Column("document_block_id", sa.Integer(), nullable=True),
        sa.Column("accepted_requirement_id", sa.Integer(), nullable=True),
        sa.Column("requirement_code", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_section", sa.String(length=255), nullable=True),
        sa.Column("source_block_key", sa.String(length=255), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("provider_used", sa.String(length=100), nullable=True),
        sa.Column("fallback_used", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("raw_ai_payload", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["accepted_requirement_id"], ["requirements.id"]),
        sa.ForeignKeyConstraint(["document_block_id"], ["document_blocks.id"]),
        sa.ForeignKeyConstraint(["document_version_id"], ["document_versions.id"]),
        sa.ForeignKeyConstraint(["parse_run_id"], ["document_parse_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_version_id",
            "parse_run_id",
            "requirement_code",
            "source_block_key",
            name="uq_ai_requirement_candidate_source",
        ),
    )
    op.create_index(
        op.f("ix_ai_requirement_candidates_accepted_requirement_id"),
        "ai_requirement_candidates",
        ["accepted_requirement_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_requirement_candidates_document_block_id"),
        "ai_requirement_candidates",
        ["document_block_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_requirement_candidates_document_version_id"),
        "ai_requirement_candidates",
        ["document_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_requirement_candidates_parse_run_id"),
        "ai_requirement_candidates",
        ["parse_run_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_requirement_candidates_status"),
        "ai_requirement_candidates",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_requirement_candidates_status"), table_name="ai_requirement_candidates")
    op.drop_index(op.f("ix_ai_requirement_candidates_parse_run_id"), table_name="ai_requirement_candidates")
    op.drop_index(op.f("ix_ai_requirement_candidates_document_version_id"), table_name="ai_requirement_candidates")
    op.drop_index(op.f("ix_ai_requirement_candidates_document_block_id"), table_name="ai_requirement_candidates")
    op.drop_index(op.f("ix_ai_requirement_candidates_accepted_requirement_id"), table_name="ai_requirement_candidates")
    op.drop_table("ai_requirement_candidates")
