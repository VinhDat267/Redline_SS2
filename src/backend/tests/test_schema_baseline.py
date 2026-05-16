from sqlalchemy import inspect


def test_full_erd_baseline_tables_exist(session_factory):
    with session_factory() as session:
        inspector = inspect(session.bind)
        table_names = set(inspector.get_table_names())

    assert table_names == {
        "activity_logs",
        "ai_batch_job_items",
        "ai_batch_jobs",
        "ai_requirement_candidates",
        "ai_review_drafts",
        "auth_rate_limit_buckets",
        "chat_attempts",
        "chat_messages",
        "chat_sessions",
        "change_item_requirement_links",
        "change_items",
        "compare_runs",
        "document_parse_runs",
        "document_surfaces",
        "document_table_cells",
        "document_table_columns",
        "document_table_rows",
        "document_tables",
        "document_blocks",
        "document_versions",
        "documents",
        "project_invitations",
        "project_members",
        "projects",
        "requirement_test_case_mappings",
        "requirements",
        "review_comments",
        "test_cases",
        "users",
    }


def test_link_and_mapping_tables_match_erd_timestamps(session_factory):
    with session_factory() as session:
        inspector = inspect(session.bind)
        link_columns = {column["name"] for column in inspector.get_columns("change_item_requirement_links")}
        mapping_columns = {
            column["name"] for column in inspector.get_columns("requirement_test_case_mappings")
        }

    assert link_columns == {"id", "change_item_id", "requirement_id", "link_type", "notes", "created_at"}
    assert mapping_columns == {"id", "requirement_id", "test_case_id", "mapping_type", "notes", "created_at"}


def test_parser_and_compare_core_tables_expose_new_columns(session_factory):
    with session_factory() as session:
        inspector = inspect(session.bind)
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        document_version_columns = {
            column["name"] for column in inspector.get_columns("document_versions")
        }
        document_block_columns = {
            column["name"] for column in inspector.get_columns("document_blocks")
        }
        chat_session_columns = {
            column["name"] for column in inspector.get_columns("chat_sessions")
        }
        chat_message_columns = {
            column["name"] for column in inspector.get_columns("chat_messages")
        }
        chat_attempt_columns = {
            column["name"] for column in inspector.get_columns("chat_attempts")
        }
        rate_limit_bucket_columns = {
            column["name"] for column in inspector.get_columns("auth_rate_limit_buckets")
        }
        compare_run_columns = {column["name"] for column in inspector.get_columns("compare_runs")}
        change_item_columns = {column["name"] for column in inspector.get_columns("change_items")}

    assert {"password_hash", "google_sub", "token_version"} <= user_columns
    assert {
        "bucket_key",
        "window_start_epoch",
        "attempt_count",
        "updated_at_epoch",
    } <= rate_limit_bucket_columns
    assert {"active_parse_run_id", "parse_status", "parsed_snapshot"} <= document_version_columns
    assert {
        "parse_run_id",
        "surface_id",
        "surface_order_index",
        "embedding_provider",
        "embedding_vector",
        "embedding_vector_json",
        "embedding_generated_at",
    } <= document_block_columns
    assert {
        "contract_id",
        "draft_id",
        "created_by_user_id",
        "title",
        "created_at",
        "updated_at",
    } <= chat_session_columns
    assert {
        "session_id",
        "role",
        "content",
        "citations_json",
        "provider_used",
        "created_at",
        "updated_at",
    } <= chat_message_columns
    assert {
        "session_id",
        "draft_id",
        "user_message_id",
        "supersedes_attempt_id",
        "status",
        "provider_used",
        "client_request_id",
        "error_code",
        "error_detail",
        "cancel_requested_at",
        "created_at",
        "updated_at",
    } <= chat_attempt_columns
    assert {
        "source_parse_run_id",
        "target_parse_run_id",
        "compare_version",
        "error_message",
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


def test_ai_requirement_candidate_table_preserves_suggestion_boundary(session_factory):
    with session_factory() as session:
        inspector = inspect(session.bind)
        candidate_columns = {
            column["name"] for column in inspector.get_columns("ai_requirement_candidates")
        }

    assert {
        "document_version_id",
        "parse_run_id",
        "document_block_id",
        "accepted_requirement_id",
        "requirement_code",
        "title",
        "description",
        "source_section",
        "source_block_key",
        "confidence",
        "status",
        "provider_used",
        "fallback_used",
        "error_message",
        "raw_ai_payload",
        "generated_at",
        "decided_at",
        "rejection_reason",
    } <= candidate_columns
