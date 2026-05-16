from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core.config import BACKEND_ROOT, settings


def test_alembic_head_applies_expanded_parser_truth_schema(tmp_path: Path):
    database_file = tmp_path / "alembic-parser.db"
    database_url = f"sqlite:///{database_file.as_posix()}"
    alembic_config = Config(str(BACKEND_ROOT / "alembic.ini"))
    original_database_url = settings.database_url

    try:
        settings.database_url = database_url
        command.upgrade(alembic_config, "head")

        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False},
        )
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        document_version_columns = {
            column["name"] for column in inspector.get_columns("document_versions")
        }
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        document_block_columns = {
            column["name"] for column in inspector.get_columns("document_blocks")
        }
        document_block_unique_constraints = {
            constraint["name"]: set(constraint["column_names"])
            for constraint in inspector.get_unique_constraints("document_blocks")
        }
        compare_run_columns = {column["name"] for column in inspector.get_columns("compare_runs")}
        change_item_columns = {column["name"] for column in inspector.get_columns("change_items")}
        ai_review_draft_columns = {
            column["name"] for column in inspector.get_columns("ai_review_drafts")
        }
        ai_batch_job_columns = {column["name"] for column in inspector.get_columns("ai_batch_jobs")}
        ai_batch_job_item_columns = {
            column["name"] for column in inspector.get_columns("ai_batch_job_items")
        }

        assert {
            "document_parse_runs",
            "document_surfaces",
            "document_tables",
            "document_table_columns",
            "document_table_rows",
            "document_table_cells",
            "ai_batch_jobs",
            "ai_batch_job_items",
            "auth_rate_limit_buckets",
        } <= table_names
        assert {"password_hash", "google_sub", "token_version"} <= user_columns
        assert "active_parse_run_id" in document_version_columns
        assert {
            "parse_run_id",
            "surface_id",
            "surface_order_index",
            "embedding_vector",
        } <= document_block_columns
        assert document_block_unique_constraints["uq_document_block_parse_run_key"] == {
            "parse_run_id",
            "block_key",
        }
        assert {
            "source_parse_run_id",
            "target_parse_run_id",
            "compare_version",
            "warning_count",
            "summary_json",
        } <= compare_run_columns
        assert {
            "surface_type",
            "surface_key",
            "container_type",
            "container_key",
            "table_key",
            "row_key",
            "change_context_json",
            "structured_diff_json",
        } <= change_item_columns
        assert {
            "provider_used",
            "fallback_used",
            "error_message",
        } <= ai_review_draft_columns
        assert {
            "compare_run_id",
            "job_type",
            "status",
            "requested_count",
            "processed_count",
            "generated_count",
            "failed_count",
            "force_regenerate",
            "use_rag",
            "requested_by_user_id",
            "error_message",
            "started_at",
            "completed_at",
            "last_heartbeat_at",
            "created_at",
            "updated_at",
        } <= ai_batch_job_columns
        assert {
            "job_id",
            "change_item_id",
            "status",
            "provider_used",
            "fallback_used",
            "error_message",
            "attempt_count",
            "started_at",
            "completed_at",
            "last_heartbeat_at",
            "created_at",
            "updated_at",
        } <= ai_batch_job_item_columns
    finally:
        settings.database_url = original_database_url
