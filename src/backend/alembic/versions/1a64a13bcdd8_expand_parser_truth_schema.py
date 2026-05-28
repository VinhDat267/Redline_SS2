"""expand parser truth schema

Revision ID: 1a64a13bcdd8
Revises: 7384d4ddf0f0
Create Date: 2026-03-26 10:30:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1a64a13bcdd8"
down_revision: Union[str, Sequence[str], None] = "7384d4ddf0f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backfill_legacy_parse_runs() -> None:
    connection = op.get_bind()
    versions_with_blocks = connection.execute(
        sa.text(
            """
            SELECT id, parse_status, uploaded_at
            FROM document_versions
            WHERE id IN (
                SELECT DISTINCT document_version_id
                FROM document_blocks
            )
            ORDER BY id
            """
        )
    ).mappings()

    for version in versions_with_blocks:
        parse_run_result = connection.execute(
            sa.text(
                """
                INSERT INTO document_parse_runs (
                    document_version_id,
                    parser_version,
                    status,
                    started_at,
                    completed_at,
                    error_message,
                    warning_count,
                    summary_json
                ) VALUES (
                    :document_version_id,
                    :parser_version,
                    :status,
                    :started_at,
                    :completed_at,
                    NULL,
                    0,
                    :summary_json
                )
                """
            ),
            {
                "document_version_id": version["id"],
                "parser_version": "legacy-v1-body-only",
                "status": "parsed" if version["parse_status"] == "parsed" else "parsed_with_warnings",
                "started_at": version["uploaded_at"],
                "completed_at": version["uploaded_at"],
                "summary_json": '{"legacy_backfill": true, "surface_types": ["body"]}',
            },
        )
        try:
            parse_run_id = parse_run_result.lastrowid
        except Exception:
            parse_run_id = None
        if parse_run_id is None:
            parse_run_id = connection.execute(
                sa.text("SELECT max(id) FROM document_parse_runs WHERE document_version_id = :document_version_id"),
                {"document_version_id": version["id"]}
            ).scalar()

        surface_result = connection.execute(
            sa.text(
                """
                INSERT INTO document_surfaces (
                    parse_run_id,
                    surface_type,
                    surface_key,
                    logical_order_index,
                    section_ref,
                    notes
                ) VALUES (
                    :parse_run_id,
                    'body',
                    'body-main',
                    0,
                    NULL,
                    'legacy backfill surface'
                )
                """
            ),
            {"parse_run_id": parse_run_id},
        )
        try:
            surface_id = surface_result.lastrowid
        except Exception:
            surface_id = None
        if surface_id is None:
            surface_id = connection.execute(
                sa.text("SELECT max(id) FROM document_surfaces WHERE parse_run_id = :parse_run_id"),
                {"parse_run_id": parse_run_id}
            ).scalar()

        connection.execute(
            sa.text(
                """
                UPDATE document_blocks
                SET parse_run_id = :parse_run_id,
                    surface_id = :surface_id,
                    surface_order_index = order_index
                WHERE document_version_id = :document_version_id
                """
            ),
            {
                "parse_run_id": parse_run_id,
                "surface_id": surface_id,
                "document_version_id": version["id"],
            },
        )

        connection.execute(
            sa.text(
                """
                UPDATE document_versions
                SET active_parse_run_id = :parse_run_id
                WHERE id = :document_version_id
                """
            ),
            {
                "parse_run_id": parse_run_id,
                "document_version_id": version["id"],
            },
        )


def _backfill_compare_context() -> None:
    connection = op.get_bind()

    connection.execute(
        sa.text(
            """
            UPDATE compare_runs
            SET source_parse_run_id = (
                    SELECT active_parse_run_id
                    FROM document_versions
                    WHERE document_versions.id = compare_runs.source_version_id
                ),
                target_parse_run_id = (
                    SELECT active_parse_run_id
                    FROM document_versions
                    WHERE document_versions.id = compare_runs.target_version_id
                )
            """
        )
    )

    connection.execute(
        sa.text(
            """
            UPDATE change_items
            SET surface_type = COALESCE(
                    (
                        SELECT ds.surface_type
                        FROM document_blocks db
                        JOIN document_surfaces ds ON ds.id = db.surface_id
                        WHERE db.id = change_items.target_block_id
                    ),
                    (
                        SELECT ds.surface_type
                        FROM document_blocks db
                        JOIN document_surfaces ds ON ds.id = db.surface_id
                        WHERE db.id = change_items.source_block_id
                    ),
                    'body'
                ),
                surface_key = COALESCE(
                    (
                        SELECT ds.surface_key
                        FROM document_blocks db
                        JOIN document_surfaces ds ON ds.id = db.surface_id
                        WHERE db.id = change_items.target_block_id
                    ),
                    (
                        SELECT ds.surface_key
                        FROM document_blocks db
                        JOIN document_surfaces ds ON ds.id = db.surface_id
                        WHERE db.id = change_items.source_block_id
                    ),
                    'body-main'
                )
            """
        )
    )


def _emit_offline_legacy_parse_run_backfill() -> None:
    op.execute(
        """
        INSERT INTO document_parse_runs (
            document_version_id,
            parser_version,
            status,
            started_at,
            completed_at,
            error_message,
            warning_count,
            summary_json
        )
        SELECT
            dv.id,
            'legacy-v1-body-only',
            CASE
                WHEN dv.parse_status = 'parsed' THEN 'parsed'
                ELSE 'parsed_with_warnings'
            END,
            dv.uploaded_at,
            dv.uploaded_at,
            NULL,
            0,
            '{"legacy_backfill": true, "surface_types": ["body"]}'
        FROM document_versions dv
        WHERE dv.id IN (
            SELECT DISTINCT document_version_id
            FROM document_blocks
        );
        """
    )
    op.execute(
        """
        INSERT INTO document_surfaces (
            parse_run_id,
            surface_type,
            surface_key,
            logical_order_index,
            section_ref,
            notes
        )
        SELECT
            dpr.id,
            'body',
            'body-main',
            0,
            NULL,
            'legacy backfill surface'
        FROM document_parse_runs dpr
        WHERE dpr.parser_version = 'legacy-v1-body-only';
        """
    )
    op.execute(
        """
        UPDATE document_blocks db
        SET parse_run_id = dpr.id,
            surface_id = ds.id,
            surface_order_index = db.order_index
        FROM document_parse_runs dpr
        JOIN document_surfaces ds ON ds.parse_run_id = dpr.id
        WHERE dpr.document_version_id = db.document_version_id
          AND dpr.parser_version = 'legacy-v1-body-only'
          AND ds.surface_key = 'body-main';
        """
    )
    op.execute(
        """
        UPDATE document_versions dv
        SET active_parse_run_id = dpr.id
        FROM document_parse_runs dpr
        WHERE dpr.document_version_id = dv.id
          AND dpr.parser_version = 'legacy-v1-body-only';
        """
    )


def _emit_offline_compare_context_backfill() -> None:
    op.execute(
        """
        UPDATE compare_runs cr
        SET source_parse_run_id = source_version.active_parse_run_id,
            target_parse_run_id = target_version.active_parse_run_id
        FROM document_versions source_version,
             document_versions target_version
        WHERE source_version.id = cr.source_version_id
          AND target_version.id = cr.target_version_id;
        """
    )
    op.execute(
        """
        UPDATE change_items ci
        SET surface_type = COALESCE(target_surface.surface_type, source_surface.surface_type, 'body'),
            surface_key = COALESCE(target_surface.surface_key, source_surface.surface_key, 'body-main')
        FROM document_blocks target_block
        LEFT JOIN document_surfaces target_surface ON target_surface.id = target_block.surface_id,
             document_blocks source_block
        LEFT JOIN document_surfaces source_surface ON source_surface.id = source_block.surface_id
        WHERE target_block.id = ci.target_block_id
          AND source_block.id = ci.source_block_id;
        """
    )
    op.execute(
        """
        UPDATE change_items ci
        SET surface_type = COALESCE(target_surface.surface_type, 'body'),
            surface_key = COALESCE(target_surface.surface_key, 'body-main')
        FROM document_blocks target_block
        LEFT JOIN document_surfaces target_surface ON target_surface.id = target_block.surface_id
        WHERE target_block.id = ci.target_block_id
          AND ci.source_block_id IS NULL;
        """
    )
    op.execute(
        """
        UPDATE change_items ci
        SET surface_type = COALESCE(source_surface.surface_type, 'body'),
            surface_key = COALESCE(source_surface.surface_key, 'body-main')
        FROM document_blocks source_block
        LEFT JOIN document_surfaces source_surface ON source_surface.id = source_block.surface_id
        WHERE source_block.id = ci.source_block_id
          AND ci.target_block_id IS NULL;
        """
    )


def upgrade() -> None:
    op.create_table(
        "document_parse_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_version_id", sa.Integer(), nullable=False),
        sa.Column("parser_version", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("warning_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary_json", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["document_version_id"], ["document_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_document_parse_runs_document_version_id"),
        "document_parse_runs",
        ["document_version_id"],
        unique=False,
    )

    op.create_table(
        "document_surfaces",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parse_run_id", sa.Integer(), nullable=False),
        sa.Column("surface_type", sa.String(length=50), nullable=False),
        sa.Column("surface_key", sa.String(length=255), nullable=False),
        sa.Column("logical_order_index", sa.Integer(), nullable=False),
        sa.Column("section_ref", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["parse_run_id"], ["document_parse_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("parse_run_id", "surface_key", name="uq_document_surface_key"),
    )
    op.create_index(
        op.f("ix_document_surfaces_parse_run_id"),
        "document_surfaces",
        ["parse_run_id"],
        unique=False,
    )

    with op.batch_alter_table("document_versions") as batch_op:
        batch_op.add_column(sa.Column("active_parse_run_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            op.f("ix_document_versions_active_parse_run_id"),
            ["active_parse_run_id"],
            unique=False,
        )
        batch_op.create_foreign_key(
            "fk_document_versions_active_parse_run_id",
            "document_parse_runs",
            ["active_parse_run_id"],
            ["id"],
        )

    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.add_column(sa.Column("parse_run_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("surface_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("surface_order_index", sa.Integer(), nullable=True))
        batch_op.create_index(op.f("ix_document_blocks_parse_run_id"), ["parse_run_id"], unique=False)
        batch_op.create_index(op.f("ix_document_blocks_surface_id"), ["surface_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_document_blocks_parse_run_id",
            "document_parse_runs",
            ["parse_run_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            "fk_document_blocks_surface_id",
            "document_surfaces",
            ["surface_id"],
            ["id"],
        )

    op.create_table(
        "document_tables",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_version_id", sa.Integer(), nullable=False),
        sa.Column("parse_run_id", sa.Integer(), nullable=False),
        sa.Column("surface_id", sa.Integer(), nullable=False),
        sa.Column("table_key", sa.String(length=255), nullable=False),
        sa.Column("section_title", sa.String(length=255), nullable=True),
        sa.Column("table_order_index", sa.Integer(), nullable=False),
        sa.Column("header_strategy", sa.String(length=50), nullable=False),
        sa.Column("caption_text", sa.Text(), nullable=True),
        sa.Column("normalized_caption_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["document_version_id"], ["document_versions.id"]),
        sa.ForeignKeyConstraint(["parse_run_id"], ["document_parse_runs.id"]),
        sa.ForeignKeyConstraint(["surface_id"], ["document_surfaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("parse_run_id", "table_key", name="uq_document_table_key"),
    )
    op.create_index(
        op.f("ix_document_tables_document_version_id"),
        "document_tables",
        ["document_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_document_tables_parse_run_id"),
        "document_tables",
        ["parse_run_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_document_tables_surface_id"),
        "document_tables",
        ["surface_id"],
        unique=False,
    )

    op.create_table(
        "document_table_columns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("table_id", sa.Integer(), nullable=False),
        sa.Column("column_key", sa.String(length=255), nullable=False),
        sa.Column("column_index", sa.Integer(), nullable=False),
        sa.Column("header_text", sa.String(length=1000), nullable=False),
        sa.Column("normalized_header_text", sa.String(length=1000), nullable=False),
        sa.Column("source_kind", sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(["table_id"], ["document_tables.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("table_id", "column_index", name="uq_document_table_column_index"),
        sa.UniqueConstraint("table_id", "column_key", name="uq_document_table_column_key"),
    )
    op.create_index(
        op.f("ix_document_table_columns_table_id"),
        "document_table_columns",
        ["table_id"],
        unique=False,
    )

    op.create_table(
        "document_table_rows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("table_id", sa.Integer(), nullable=False),
        sa.Column("document_block_id", sa.Integer(), nullable=False),
        sa.Column("row_key", sa.Text(), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("is_header_row", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("structured_row_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["document_block_id"], ["document_blocks.id"]),
        sa.ForeignKeyConstraint(["table_id"], ["document_tables.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_block_id"),
        sa.UniqueConstraint("table_id", "row_index", name="uq_document_table_row_index"),
    )
    op.create_index(
        op.f("ix_document_table_rows_document_block_id"),
        "document_table_rows",
        ["document_block_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_document_table_rows_table_id"),
        "document_table_rows",
        ["table_id"],
        unique=False,
    )

    op.create_table(
        "document_table_cells",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("row_id", sa.Integer(), nullable=False),
        sa.Column("column_id", sa.Integer(), nullable=True),
        sa.Column("cell_key", sa.Text(), nullable=False),
        sa.Column("column_index", sa.Integer(), nullable=False),
        sa.Column("raw_content", sa.Text(), nullable=False),
        sa.Column("normalized_content", sa.Text(), nullable=False),
        sa.Column("row_span", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("col_span", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("merge_origin_key", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["column_id"], ["document_table_columns.id"]),
        sa.ForeignKeyConstraint(["row_id"], ["document_table_rows.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("row_id", "column_index", name="uq_document_table_cell_column_index"),
    )
    op.create_index(
        op.f("ix_document_table_cells_column_id"),
        "document_table_cells",
        ["column_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_document_table_cells_row_id"),
        "document_table_cells",
        ["row_id"],
        unique=False,
    )

    with op.batch_alter_table("compare_runs") as batch_op:
        batch_op.add_column(sa.Column("source_parse_run_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("target_parse_run_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "compare_version",
                sa.String(length=50),
                nullable=False,
                server_default="v1",
            )
        )
        batch_op.add_column(sa.Column("error_message", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "warning_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(sa.Column("summary_json", sa.Text(), nullable=True))
        batch_op.create_index(
            op.f("ix_compare_runs_source_parse_run_id"),
            ["source_parse_run_id"],
            unique=False,
        )
        batch_op.create_index(
            op.f("ix_compare_runs_target_parse_run_id"),
            ["target_parse_run_id"],
            unique=False,
        )
        batch_op.create_foreign_key(
            "fk_compare_runs_source_parse_run_id",
            "document_parse_runs",
            ["source_parse_run_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            "fk_compare_runs_target_parse_run_id",
            "document_parse_runs",
            ["target_parse_run_id"],
            ["id"],
        )

    with op.batch_alter_table("change_items") as batch_op:
        batch_op.add_column(sa.Column("surface_type", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("surface_key", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("container_type", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("container_key", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("table_key", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("row_key", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("change_context_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("structured_diff_json", sa.Text(), nullable=True))
        batch_op.create_index(op.f("ix_change_items_surface_type"), ["surface_type"], unique=False)
        batch_op.create_index(op.f("ix_change_items_surface_key"), ["surface_key"], unique=False)
        batch_op.create_index(op.f("ix_change_items_table_key"), ["table_key"], unique=False)
        batch_op.create_index(op.f("ix_change_items_row_key"), ["row_key"], unique=False)

    if context.is_offline_mode():
        _emit_offline_legacy_parse_run_backfill()
        _emit_offline_compare_context_backfill()
    else:
        _backfill_legacy_parse_runs()
        _backfill_compare_context()

    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.alter_column("parse_run_id", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("surface_id", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("surface_order_index", existing_type=sa.Integer(), nullable=False)

    with op.batch_alter_table("compare_runs") as batch_op:
        batch_op.alter_column("source_parse_run_id", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("target_parse_run_id", existing_type=sa.Integer(), nullable=False)

    with op.batch_alter_table("change_items") as batch_op:
        batch_op.alter_column("surface_type", existing_type=sa.String(length=50), nullable=False)
        batch_op.alter_column("surface_key", existing_type=sa.String(length=255), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("change_items") as batch_op:
        batch_op.drop_index(op.f("ix_change_items_row_key"))
        batch_op.drop_index(op.f("ix_change_items_table_key"))
        batch_op.drop_index(op.f("ix_change_items_surface_key"))
        batch_op.drop_index(op.f("ix_change_items_surface_type"))
        batch_op.drop_column("structured_diff_json")
        batch_op.drop_column("change_context_json")
        batch_op.drop_column("row_key")
        batch_op.drop_column("table_key")
        batch_op.drop_column("container_key")
        batch_op.drop_column("container_type")
        batch_op.drop_column("surface_key")
        batch_op.drop_column("surface_type")

    with op.batch_alter_table("compare_runs") as batch_op:
        batch_op.drop_index(op.f("ix_compare_runs_target_parse_run_id"))
        batch_op.drop_index(op.f("ix_compare_runs_source_parse_run_id"))
        batch_op.drop_constraint("fk_compare_runs_target_parse_run_id", type_="foreignkey")
        batch_op.drop_constraint("fk_compare_runs_source_parse_run_id", type_="foreignkey")
        batch_op.drop_column("summary_json")
        batch_op.drop_column("warning_count")
        batch_op.drop_column("error_message")
        batch_op.drop_column("compare_version")
        batch_op.drop_column("target_parse_run_id")
        batch_op.drop_column("source_parse_run_id")

    op.drop_index(op.f("ix_document_table_cells_row_id"), table_name="document_table_cells")
    op.drop_index(op.f("ix_document_table_cells_column_id"), table_name="document_table_cells")
    op.drop_table("document_table_cells")

    op.drop_index(op.f("ix_document_table_rows_table_id"), table_name="document_table_rows")
    op.drop_index(op.f("ix_document_table_rows_document_block_id"), table_name="document_table_rows")
    op.drop_table("document_table_rows")

    op.drop_index(op.f("ix_document_table_columns_table_id"), table_name="document_table_columns")
    op.drop_table("document_table_columns")

    op.drop_index(op.f("ix_document_tables_surface_id"), table_name="document_tables")
    op.drop_index(op.f("ix_document_tables_parse_run_id"), table_name="document_tables")
    op.drop_index(op.f("ix_document_tables_document_version_id"), table_name="document_tables")
    op.drop_table("document_tables")

    with op.batch_alter_table("document_blocks") as batch_op:
        batch_op.drop_constraint("fk_document_blocks_surface_id", type_="foreignkey")
        batch_op.drop_constraint("fk_document_blocks_parse_run_id", type_="foreignkey")
        batch_op.drop_index(op.f("ix_document_blocks_surface_id"))
        batch_op.drop_index(op.f("ix_document_blocks_parse_run_id"))
        batch_op.drop_column("surface_order_index")
        batch_op.drop_column("surface_id")
        batch_op.drop_column("parse_run_id")

    with op.batch_alter_table("document_versions") as batch_op:
        batch_op.drop_constraint("fk_document_versions_active_parse_run_id", type_="foreignkey")
        batch_op.drop_index(op.f("ix_document_versions_active_parse_run_id"))
        batch_op.drop_column("active_parse_run_id")

    op.drop_index(op.f("ix_document_surfaces_parse_run_id"), table_name="document_surfaces")
    op.drop_table("document_surfaces")

    op.drop_index(op.f("ix_document_parse_runs_document_version_id"), table_name="document_parse_runs")
    op.drop_table("document_parse_runs")
