from sqlalchemy import inspect


def test_document_parse_run_and_surface_tables_match_contract(session_factory):
    with session_factory() as session:
        inspector = inspect(session.bind)
        parse_run_columns = {
            column["name"] for column in inspector.get_columns("document_parse_runs")
        }
        surface_columns = {
            column["name"] for column in inspector.get_columns("document_surfaces")
        }

    assert parse_run_columns == {
        "id",
        "document_version_id",
        "parser_version",
        "status",
        "started_at",
        "completed_at",
        "error_message",
        "warning_count",
        "summary_json",
    }
    assert surface_columns == {
        "id",
        "parse_run_id",
        "surface_type",
        "surface_key",
        "logical_order_index",
        "section_ref",
        "notes",
    }


def test_structured_table_truth_tables_match_contract(session_factory):
    with session_factory() as session:
        inspector = inspect(session.bind)
        table_columns = {column["name"] for column in inspector.get_columns("document_tables")}
        column_columns = {
            column["name"] for column in inspector.get_columns("document_table_columns")
        }
        row_columns = {column["name"] for column in inspector.get_columns("document_table_rows")}
        cell_columns = {column["name"] for column in inspector.get_columns("document_table_cells")}

    assert table_columns == {
        "id",
        "document_version_id",
        "parse_run_id",
        "surface_id",
        "table_key",
        "section_title",
        "table_order_index",
        "header_strategy",
        "caption_text",
        "normalized_caption_text",
    }
    assert column_columns == {
        "id",
        "table_id",
        "column_key",
        "column_index",
        "header_text",
        "normalized_header_text",
        "source_kind",
    }
    assert row_columns == {
        "id",
        "table_id",
        "document_block_id",
        "row_key",
        "row_index",
        "is_header_row",
        "structured_row_json",
    }
    assert cell_columns == {
        "id",
        "row_id",
        "column_id",
        "cell_key",
        "column_index",
        "raw_content",
        "normalized_content",
        "row_span",
        "col_span",
        "merge_origin_key",
    }
