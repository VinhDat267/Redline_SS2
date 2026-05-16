import json

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    DocumentBlock,
    DocumentSurface,
    DocumentTable,
    DocumentTableCell,
    DocumentTableColumn,
    DocumentTableRow,
    DocumentVersion,
)
from app.services.documents import get_document_or_404, get_document_version_or_404, list_document_versions


_SURFACE_GROUP_KEY_BY_TYPE = {
    "body": "body",
    "header": "headers",
    "footer": "footers",
    "footnote": "footnotes",
    "endnote": "endnotes",
    "page": "pages",
}


def get_parser_workspace(
    session: Session,
    document_id: int,
    version_id: int | None,
) -> dict[str, object]:
    document = get_document_or_404(session, document_id)
    versions = list_document_versions(session, document_id)
    if not versions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document has no versions",
        )

    selected_version = _select_workspace_version(versions, version_id)
    parse_run = selected_version.active_parse_run
    surface_groups = {
        "body": [],
        "headers": [],
        "footers": [],
        "footnotes": [],
        "endnotes": [],
        "pages": [],
    }
    summary = {
        "total_surfaces": 0,
        "total_blocks": 0,
        "table_count": 0,
        "row_count": 0,
        "warning_count": selected_version.warning_count,
        "diagnostics": [],
    }

    if parse_run is not None:
        surface_item_counts = dict(
            session.execute(
                select(DocumentBlock.surface_id, func.count(DocumentBlock.id))
                .where(DocumentBlock.parse_run_id == parse_run.id)
                .group_by(DocumentBlock.surface_id)
            ).all()
        )
        surfaces = list(
            session.scalars(
                select(DocumentSurface)
                .where(DocumentSurface.parse_run_id == parse_run.id)
                .order_by(DocumentSurface.logical_order_index)
            )
        )
        for surface in surfaces:
            surface_groups[_SURFACE_GROUP_KEY_BY_TYPE[surface.surface_type]].append(
                {
                    "id": surface.id,
                    "surface_key": surface.surface_key,
                    "surface_type": surface.surface_type,
                    "label": _build_surface_label(surface),
                    "item_count": int(surface_item_counts.get(surface.id, 0)),
                }
            )

        parsed_snapshot = _parse_snapshot(selected_version.parsed_snapshot)
        parse_summary = _parse_summary_json(parse_run.summary_json)
        summary = {
            "total_surfaces": int(parsed_snapshot.get("total_surfaces", len(surfaces))),
            "total_blocks": int(parsed_snapshot.get("total_blocks", sum(surface_item_counts.values()))),
            "table_count": int(parsed_snapshot.get("table_count", 0)),
            "row_count": int(parsed_snapshot.get("row_count", 0)),
            "warning_count": parse_run.warning_count,
            "coverage": _parse_coverage(parse_summary.get("coverage")),
            "diagnostics": _parse_diagnostics(parse_summary.get("diagnostics")),
        }
        pdf_summary = parse_summary.get("pdf")
        if isinstance(pdf_summary, dict):
            summary["pdf"] = pdf_summary

    return {
        "document": document,
        "versions": versions,
        "selected_version": selected_version,
        "parse_run": parse_run,
        "summary": summary,
        "surface_groups": surface_groups,
        "compare_readiness": _build_compare_readiness(selected_version),
    }


def get_parser_surface_detail(
    session: Session,
    version_id: int,
    surface_id: int,
) -> dict[str, object]:
    version = get_document_version_or_404(session, version_id)
    if version.active_parse_run_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version has no active parse run",
        )

    surface = session.scalar(
        select(DocumentSurface)
        .where(DocumentSurface.id == surface_id)
        .where(DocumentSurface.parse_run_id == version.active_parse_run_id)
    )
    if surface is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parser surface not found",
        )

    blocks = list(
        session.scalars(
            select(DocumentBlock)
            .where(DocumentBlock.surface_id == surface.id)
            .order_by(DocumentBlock.surface_order_index)
        )
    )
    tables = list(
        session.scalars(
            select(DocumentTable)
            .where(DocumentTable.surface_id == surface.id)
            .options(
                selectinload(DocumentTable.columns),
                selectinload(DocumentTable.rows)
                .selectinload(DocumentTableRow.cells)
                .selectinload(DocumentTableCell.column),
                selectinload(DocumentTable.rows).selectinload(DocumentTableRow.document_block),
            )
            .order_by(DocumentTable.table_order_index)
        )
    )

    items = _build_surface_items(blocks, tables)
    rendered_tables = [_build_render_table(table) for table in tables]

    return {
        "surface": {
            "id": surface.id,
            "surface_key": surface.surface_key,
            "surface_type": surface.surface_type,
            "label": _build_surface_label(surface),
            "logical_order_index": surface.logical_order_index,
        },
        "items": items,
        "tables": rendered_tables,
    }


def _select_workspace_version(
    versions: list[DocumentVersion],
    version_id: int | None,
) -> DocumentVersion:
    if version_id is not None:
        for version in versions:
            if version.id == version_id:
                return version
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found for parser workspace",
        )

    parsed_versions = [version for version in versions if version.active_parse_run_id is not None]
    if parsed_versions:
        return parsed_versions[-1]
    return versions[-1]


def _parse_snapshot(parsed_snapshot: str | None) -> dict[str, object]:
    if not parsed_snapshot:
        return {}
    try:
        payload = json.loads(parsed_snapshot)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _parse_summary_json(summary_json: str | None) -> dict[str, object]:
    if not summary_json:
        return {}
    try:
        payload = json.loads(summary_json)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _parse_coverage(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    return {
        "policy_result": str(value.get("policy_result", "pass")),
        "canonical_text_length": int(value.get("canonical_text_length", 0) or 0),
        "secondary_text_length": int(value.get("secondary_text_length", 0) or 0),
        "expected_token_count": int(value.get("expected_token_count", 0) or 0),
        "matched_expected_token_count": _parse_optional_int(value.get("matched_expected_token_count")),
        "diagnostic_only_token_count": _parse_optional_int(value.get("diagnostic_only_token_count")),
        "ignored_token_count": _parse_optional_int(value.get("ignored_token_count")),
        "coverage_ratio": _parse_optional_float(value.get("coverage_ratio")),
        "unmatched_text_samples": _parse_text_list(value.get("unmatched_text_samples")),
        "retained_token_count": _parse_optional_int(value.get("retained_token_count")),
        "low_confidence_token_ratio": _parse_optional_float(value.get("low_confidence_token_ratio")),
    }


def _parse_diagnostics(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []

    diagnostics: list[dict[str, object]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        diagnostics.append(
            {
                "code": str(item.get("code", "")),
                "severity": str(item.get("severity", "warning")),
                "category": str(item.get("category", "pdf" if "metadata" in item else "")),
                "policy_impact": str(
                    item.get(
                        "policy_impact",
                        item.get("metadata", {}).get(
                            "impact_policy",
                            "fail" if item.get("severity") == "error" else "warn",
                        )
                        if isinstance(item.get("metadata"), dict)
                        else "warn",
                    )
                ),
                "source_part": str(item.get("source_part", "pdf")),
                "source_path": item.get("source_path") if item.get("source_path") is not None else None,
                "relationship_id": item.get("relationship_id") if item.get("relationship_id") is not None else None,
                "occurrence_key": str(item.get("occurrence_key", _build_diagnostic_occurrence_key(item))),
                "surface_type": item.get("surface_type") if item.get("surface_type") is not None else None,
                "message": str(item.get("message", "")),
                "count": int(item.get("count", 1) or 1),
                "text_samples": _parse_text_list(item.get("text_samples")),
                "samples": _parse_text_list(item.get("samples")) if "samples" in item else None,
                "metadata": item.get("metadata") if isinstance(item.get("metadata"), dict) else None,
            }
        )
    return diagnostics


def _parse_optional_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_diagnostic_occurrence_key(item: dict[str, object]) -> str:
    metadata = item.get("metadata")
    page = metadata.get("page") if isinstance(metadata, dict) else None
    return f"{item.get('code', '')}:pdf:{page or item.get('message', '')}"


def _parse_text_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None]


def _build_surface_label(surface: DocumentSurface) -> str:
    if surface.surface_type == "page":
        page_number = _extract_page_number(surface)
        return f"Page {page_number}" if page_number is not None else "Page"
    if surface.surface_type == "body":
        return "Body"
    if surface.surface_type in {"header", "footer"} and surface.section_ref:
        return f"{surface.surface_type.title()} / {surface.section_ref}"
    if surface.surface_type in {"footnote", "endnote"}:
        suffix = surface.surface_key.split("-", maxsplit=1)[-1]
        return f"{surface.surface_type.title()} / {suffix}"
    return surface.surface_type.title()


def _extract_page_number(surface: DocumentSurface) -> int | None:
    for candidate in (surface.section_ref, surface.surface_key):
        if not candidate:
            continue
        raw_suffix = candidate.rsplit("-", maxsplit=1)[-1]
        try:
            return int(raw_suffix)
        except ValueError:
            continue
    return None


def _build_compare_readiness(version: DocumentVersion) -> dict[str, object]:
    is_ready = version.parse_status in {"parsed", "parsed_with_warnings"} and version.active_parse_run_id is not None
    if is_ready:
        return {
            "is_ready": True,
            "status": "ready",
            "message": "Version is parsed and ready for compare setup.",
        }
    return {
        "is_ready": False,
        "status": "not_ready",
        "message": "Version must be parsed before compare setup.",
    }


def _build_surface_items(
    blocks: list[DocumentBlock],
    tables: list[DocumentTable],
) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for block in blocks:
        if block.block_type == "table_row":
            continue
        items.append(
            {
                "kind": "block",
                "block_id": block.id,
                "block_type": block.block_type,
                "section_title": block.section_title,
                "surface_order_index": block.surface_order_index,
                "raw_content": block.raw_content,
                "normalized_content": block.normalized_content,
            }
        )

    for table in tables:
        row_blocks = [row.document_block for row in table.rows if row.document_block is not None]
        first_surface_order_index = min(
            (row_block.surface_order_index for row_block in row_blocks),
            default=table.table_order_index,
        )
        items.append(
            {
                "kind": "table",
                "table_id": table.id,
                "table_key": table.table_key,
                "surface_order_index": first_surface_order_index,
                "row_count": len(table.rows),
            }
        )

    return sorted(items, key=lambda item: (int(item["surface_order_index"]), item["kind"]))


def _build_render_table(table: DocumentTable) -> dict[str, object]:
    ordered_columns = sorted(table.columns, key=lambda column: column.column_index)
    rows = []
    for row in sorted(table.rows, key=lambda table_row: table_row.row_index):
        structured_payload = json.loads(row.structured_row_json)
        cell_payloads = structured_payload.get("cells", []) if isinstance(structured_payload, dict) else []
        cell_payloads_by_index = {
            int(cell_payload["column_index"]): cell_payload
            for cell_payload in cell_payloads
            if isinstance(cell_payload, dict) and "column_index" in cell_payload
        }
        columns_by_index = {column.column_index: column for column in ordered_columns}

        rendered_cells = []
        for cell in sorted(row.cells, key=lambda table_cell: table_cell.column_index):
            payload = cell_payloads_by_index.get(cell.column_index, {})
            column = cell.column or columns_by_index.get(cell.column_index)
            rendered_cells.append(
                {
                    "column_key": column.column_key if column is not None else payload.get("column_key"),
                    "column_index": cell.column_index,
                    "raw_value": payload.get("raw_value", cell.raw_content),
                    "normalized_value": payload.get("normalized_value", cell.normalized_content),
                    "merge_origin_key": payload.get("merge_origin_key", cell.merge_origin_key),
                    "row_span": int(payload.get("row_span", cell.row_span)),
                    "col_span": int(payload.get("col_span", cell.col_span)),
                }
            )

        rows.append(
            {
                "row_key": row.row_key,
                "row_index": row.row_index,
                "is_header_row": row.is_header_row,
                "cells": rendered_cells,
            }
        )

    return {
        "id": table.id,
        "table_key": table.table_key,
        "header_strategy": table.header_strategy,
        "section_title": table.section_title,
        "columns": [
            {
                "column_key": column.column_key,
                "column_index": column.column_index,
                "header_text": column.header_text,
            }
            for column in ordered_columns
        ],
        "rows": rows,
    }
