import json
from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    AIBatchJob,
    AIBatchJobItem,
    AIReviewDraft,
    ChangeItem,
    ChangeItemRequirementLink,
    CompareRun,
    DocumentBlock,
    DocumentTable,
    DocumentTableRow,
    DocumentVersion,
)
from app.models.mixins import utcnow
from app.schemas.compare import CompareDocumentRead, CompareVersionRead
from app.services import ai_batch_jobs as ai_batch_job_service


_PARSED_STATUSES = {"parsed", "parsed_with_warnings"}
_ROOT_SECTION = "__ROOT__"
_KEY_FAMILY_ALIASES = {
    "requirement_id": {"requirement id", "req id", "req_id", "requirement_id"},
    "test_case_id": {"test case id", "tc id", "test_case_id", "test case_id"},
    "parameter": {"parameter", "param"},
    "field": {"field"},
    "name": {"name"},
    "code": {"code"},
    "id": {"id"},
}
_KEY_FAMILY_PRIORITY = [
    "requirement_id",
    "test_case_id",
    "parameter",
    "field",
    "name",
    "code",
    "id",
]


def create_compare_run(
    session: Session,
    document_id: int,
    source_version_id: int,
    target_version_id: int,
    actor_user_id: int | None,
) -> dict[str, object]:
    source_version = _get_parsed_version(session, document_id, source_version_id)
    target_version = _get_parsed_version(session, document_id, target_version_id)

    if source_version.id == target_version.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Source and target versions must be different",
        )

    compare_run = CompareRun(
        source_version_id=source_version.id,
        target_version_id=target_version.id,
        source_parse_run_id=source_version.active_parse_run_id,
        target_parse_run_id=target_version.active_parse_run_id,
        triggered_by_user_id=actor_user_id,
        compare_version="v1",
        compare_status="running",
        warning_count=0,
    )
    session.add(compare_run)
    session.commit()
    session.refresh(compare_run)

    try:
        change_items, warnings = _build_change_items(session, compare_run)
        session.add_all(change_items)

        summary = _build_summary(change_items)
        compare_run.compare_status = "completed_with_warnings" if warnings else "completed"
        compare_run.completed_at = utcnow()
        compare_run.error_message = None
        compare_run.warning_count = len(warnings)
        compare_run.summary_json = json.dumps(
            {
                **summary,
                "warnings": warnings,
            },
            separators=(",", ":"),
            ensure_ascii=True,
        )
        session.add(compare_run)
        session.commit()
        session.refresh(compare_run)
        return get_compare_run_detail(session, compare_run.id)
    except Exception as exc:
        session.rollback()
        failed_run = session.get(CompareRun, compare_run.id)
        if failed_run is not None:
            failed_run.compare_status = "failed"
            failed_run.completed_at = utcnow()
            failed_run.error_message = str(exc)
            failed_run.warning_count = 0
            failed_run.summary_json = json.dumps(_empty_summary(), separators=(",", ":"), ensure_ascii=True)
            session.add(failed_run)
            session.commit()
        raise


def get_compare_run_detail(session: Session, compare_run_id: int) -> dict[str, object]:
    compare_run = _get_compare_run_or_404(session, compare_run_id)
    queue = list_compare_run_change_items(session, compare_run_id)

    return {
        "id": compare_run.id,
        "compare_version": compare_run.compare_version,
        "compare_status": compare_run.compare_status,
        "started_at": compare_run.started_at,
        "completed_at": compare_run.completed_at,
        "source_parse_run_id": compare_run.source_parse_run_id,
        "target_parse_run_id": compare_run.target_parse_run_id,
        "is_stale": is_compare_run_stale(compare_run),
        "warning_count": compare_run.warning_count,
        "warnings": _parse_warnings(compare_run.summary_json),
        "document": CompareDocumentRead.model_validate(compare_run.source_version.document).model_dump(mode="json"),
        "source_version": CompareVersionRead.model_validate(compare_run.source_version).model_dump(mode="json"),
        "target_version": CompareVersionRead.model_validate(compare_run.target_version).model_dump(mode="json"),
        "summary": _parse_summary(compare_run.summary_json),
        "selected_change_item_id": queue[0]["id"] if queue else None,
        "has_ai_review_drafts": _has_ai_review_drafts(session, compare_run.id),
        "impact_summary_ready": _impact_summary_ready(session, compare_run.id),
        "active_ai_batch_job": ai_batch_job_service.get_active_ai_batch_job_summary(session, compare_run.id),
        "ai_batch_summary": ai_batch_job_service.get_latest_ai_batch_job_summary(session, compare_run.id),
    }


def list_document_compare_run_details(session: Session, document_id: int) -> list[dict[str, object]]:
    compare_runs = list(
        session.scalars(
            select(CompareRun)
            .join(DocumentVersion, CompareRun.source_version_id == DocumentVersion.id)
            .where(DocumentVersion.document_id == document_id)
            .order_by(CompareRun.id)
        )
    )
    return [get_compare_run_detail(session, compare_run.id) for compare_run in compare_runs]


def is_compare_run_stale(compare_run: CompareRun) -> bool:
    source_active_parse_run_id = compare_run.source_version.active_parse_run_id if compare_run.source_version else None
    target_active_parse_run_id = compare_run.target_version.active_parse_run_id if compare_run.target_version else None
    return (
        compare_run.source_parse_run_id != source_active_parse_run_id
        or compare_run.target_parse_run_id != target_active_parse_run_id
    )


def list_compare_run_change_items(session: Session, compare_run_id: int) -> list[dict[str, object]]:
    compare_run = _get_compare_run_or_404(session, compare_run_id)
    active_job_item_statuses = _load_active_job_item_statuses(session, compare_run.id)
    change_items = list(
        session.scalars(
            select(ChangeItem)
            .where(ChangeItem.compare_run_id == compare_run.id)
            .options(
                joinedload(ChangeItem.ai_review_draft),
                joinedload(ChangeItem.source_block).joinedload(DocumentBlock.surface),
                joinedload(ChangeItem.target_block).joinedload(DocumentBlock.surface),
            )
        )
    )

    serialized_items = [
        {
            "id": change_item.id,
            "compare_run_id": change_item.compare_run_id,
            "change_type": change_item.change_type,
            "review_status": change_item.review_status,
            "section_title": change_item.section_title,
            "surface_type": change_item.surface_type,
            "surface_key": change_item.surface_key,
            "container_type": change_item.container_type,
            "container_key": change_item.container_key,
            "table_key": change_item.table_key,
            "row_key": change_item.row_key,
            "old_content": change_item.old_content,
            "new_content": change_item.new_content,
            "summary": change_item.summary,
            "ai_generation_status": _resolve_ai_generation_status(
                change_item,
                active_job_item_statuses.get(change_item.id),
            ),
            "has_ai_review_draft": (
                change_item.ai_review_draft is not None
                or _resolve_ai_generation_status(change_item, active_job_item_statuses.get(change_item.id))
                != "not_requested"
            ),
            "sort_key": _build_sort_key(change_item),
        }
        for change_item in change_items
    ]
    return sorted(serialized_items, key=lambda item: item["sort_key"])


def _get_parsed_version(session: Session, document_id: int, version_id: int) -> DocumentVersion:
    version = session.get(DocumentVersion, version_id)
    if version is None or version.document_id != document_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document version not found")
    if version.parse_status not in _PARSED_STATUSES or version.active_parse_run_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both document versions must be parsed before compare",
        )
    return version


def _get_compare_run_or_404(session: Session, compare_run_id: int) -> CompareRun:
    compare_run = session.scalar(
        select(CompareRun)
        .where(CompareRun.id == compare_run_id)
        .options(
            joinedload(CompareRun.source_version).joinedload(DocumentVersion.document),
            joinedload(CompareRun.target_version),
        )
    )
    if compare_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")
    return compare_run


def _build_change_items(
    session: Session,
    compare_run: CompareRun,
) -> tuple[list[ChangeItem], list[str]]:
    source_blocks = _load_blocks_for_parse_run(session, compare_run.source_parse_run_id)
    target_blocks = _load_blocks_for_parse_run(session, compare_run.target_parse_run_id)
    source_tables = _load_tables_for_parse_run(session, compare_run.source_parse_run_id)
    target_tables = _load_tables_for_parse_run(session, compare_run.target_parse_run_id)

    change_items: list[ChangeItem] = []
    warnings: list[str] = []

    change_items.extend(_compare_text_blocks(compare_run, source_blocks, target_blocks))

    table_change_items, table_warnings = _compare_tables(compare_run, source_tables, target_tables)
    change_items.extend(table_change_items)
    warnings.extend(table_warnings)

    return change_items, sorted(set(warnings))


def _load_blocks_for_parse_run(session: Session, parse_run_id: int) -> list[DocumentBlock]:
    statement = (
        select(DocumentBlock)
        .where(DocumentBlock.parse_run_id == parse_run_id)
        .options(
            joinedload(DocumentBlock.surface),
            joinedload(DocumentBlock.table_row).joinedload(DocumentTableRow.table),
        )
    )
    blocks = session.execute(statement).unique().scalars().all()
    return sorted(blocks, key=lambda block: (block.surface.logical_order_index, block.surface_order_index))


def _load_tables_for_parse_run(session: Session, parse_run_id: int) -> list[DocumentTable]:
    statement = (
        select(DocumentTable)
        .where(DocumentTable.parse_run_id == parse_run_id)
        .options(
            joinedload(DocumentTable.surface),
            joinedload(DocumentTable.columns),
            joinedload(DocumentTable.rows).joinedload(DocumentTableRow.document_block),
        )
    )
    tables = session.execute(statement).unique().scalars().all()
    return sorted(tables, key=lambda table: (table.surface.logical_order_index, table.table_order_index))


def _compare_text_blocks(
    compare_run: CompareRun,
    source_blocks: list[DocumentBlock],
    target_blocks: list[DocumentBlock],
) -> list[ChangeItem]:
    source_partitions = _partition_text_blocks(source_blocks)
    target_partitions = _partition_text_blocks(target_blocks)
    partition_keys = _sorted_partition_keys(set(source_partitions) | set(target_partitions))

    change_items: list[ChangeItem] = []
    for partition_key in partition_keys:
        change_items.extend(
            _compare_text_partition(
                compare_run,
                source_partitions.get(partition_key, []),
                target_partitions.get(partition_key, []),
            )
        )
    return change_items


def _partition_text_blocks(
    blocks: list[DocumentBlock],
) -> dict[tuple[str, str], list[DocumentBlock]]:
    partitions: dict[tuple[str, str], list[DocumentBlock]] = defaultdict(list)
    for block in blocks:
        if block.block_type == "table_row":
            continue
        partitions[(block.surface.surface_type, block.surface.surface_key)].append(block)
    return partitions


def _compare_text_partition(
    compare_run: CompareRun,
    source_blocks: list[DocumentBlock],
    target_blocks: list[DocumentBlock],
) -> list[ChangeItem]:
    matches_with_sentinel = _build_lcs_pairs(source_blocks, target_blocks) + [
        (len(source_blocks), len(target_blocks))
    ]
    previous_source_index = -1
    previous_target_index = -1
    change_items: list[ChangeItem] = []

    for source_index, target_index in matches_with_sentinel:
        source_window = source_blocks[previous_source_index + 1 : source_index]
        target_window = target_blocks[previous_target_index + 1 : target_index]
        change_items.extend(_compare_text_window(compare_run, source_window, target_window))
        previous_source_index = source_index
        previous_target_index = target_index

    return change_items


def _compare_text_window(
    compare_run: CompareRun,
    source_window: list[DocumentBlock],
    target_window: list[DocumentBlock],
) -> list[ChangeItem]:
    if not source_window and not target_window:
        return []

    if (
        source_window
        and target_window
        and len(source_window) == len(target_window)
        and all(
            _can_pair_text_replacement(source_block, target_block)
            for source_block, target_block in zip(source_window, target_window, strict=True)
        )
    ):
        change_items: list[ChangeItem] = []
        for source_block, target_block in zip(source_window, target_window, strict=True):
            if source_block.normalized_content == target_block.normalized_content:
                continue
            change_items.append(_build_change_item(compare_run, "modified", source_block, target_block))
        return change_items

    return [
        *[_build_change_item(compare_run, "removed", source_block, None) for source_block in source_window],
        *[_build_change_item(compare_run, "added", None, target_block) for target_block in target_window],
    ]


def _build_lcs_pairs(
    source_blocks: list[DocumentBlock],
    target_blocks: list[DocumentBlock],
) -> list[tuple[int, int]]:
    source_signatures = [_build_text_signature(block) for block in source_blocks]
    target_signatures = [_build_text_signature(block) for block in target_blocks]
    rows = len(source_signatures)
    columns = len(target_signatures)
    dp = [[0] * (columns + 1) for _ in range(rows + 1)]

    for source_index in range(rows - 1, -1, -1):
        for target_index in range(columns - 1, -1, -1):
            if source_signatures[source_index] == target_signatures[target_index]:
                dp[source_index][target_index] = 1 + dp[source_index + 1][target_index + 1]
            else:
                dp[source_index][target_index] = max(
                    dp[source_index + 1][target_index],
                    dp[source_index][target_index + 1],
                )

    pairs: list[tuple[int, int]] = []
    source_index = 0
    target_index = 0
    while source_index < rows and target_index < columns:
        if source_signatures[source_index] == target_signatures[target_index]:
            pairs.append((source_index, target_index))
            source_index += 1
            target_index += 1
        elif dp[source_index + 1][target_index] >= dp[source_index][target_index + 1]:
            source_index += 1
        else:
            target_index += 1
    return pairs


def _build_text_signature(block: DocumentBlock) -> tuple[str, str, str]:
    return (
        block.block_type,
        _section_signature(block.section_title),
        block.normalized_content,
    )


def _section_signature(section_title: str | None) -> str:
    normalized = " ".join((section_title or "").split())
    return normalized or _ROOT_SECTION


def _can_pair_text_replacement(source_block: DocumentBlock, target_block: DocumentBlock) -> bool:
    if source_block.block_type != target_block.block_type:
        return False

    source_section = _normalize_optional_text(source_block.section_title)
    target_section = _normalize_optional_text(target_block.section_title)
    return source_section == target_section or not source_section or not target_section


def _compare_tables(
    compare_run: CompareRun,
    source_tables: list[DocumentTable],
    target_tables: list[DocumentTable],
) -> tuple[list[ChangeItem], list[str]]:
    source_partitions = _partition_tables_by_surface(source_tables)
    target_partitions = _partition_tables_by_surface(target_tables)
    partition_keys = _sorted_partition_keys(set(source_partitions) | set(target_partitions))

    change_items: list[ChangeItem] = []
    warnings: list[str] = []

    for partition_key in partition_keys:
        paired_tables, unpaired_source, unpaired_target, partition_warnings = _align_tables(
            source_partitions.get(partition_key, []),
            target_partitions.get(partition_key, []),
        )
        warnings.extend(partition_warnings)

        for source_table, target_table in paired_tables:
            table_change_items, table_warnings = _compare_table_pair(compare_run, source_table, target_table)
            change_items.extend(table_change_items)
            warnings.extend(table_warnings)

        for source_table in unpaired_source:
            for row in _sorted_rows(source_table.rows):
                change_items.append(_build_change_item(compare_run, "removed", row.document_block, None))
        for target_table in unpaired_target:
            for row in _sorted_rows(target_table.rows):
                change_items.append(_build_change_item(compare_run, "added", None, row.document_block))

    return change_items, warnings


def _partition_tables_by_surface(
    tables: list[DocumentTable],
) -> dict[tuple[str, str], list[DocumentTable]]:
    partitions: dict[tuple[str, str], list[DocumentTable]] = defaultdict(list)
    for table in tables:
        partitions[(table.surface.surface_type, table.surface.surface_key)].append(table)
    return partitions


def _align_tables(
    source_tables: list[DocumentTable],
    target_tables: list[DocumentTable],
) -> tuple[list[tuple[DocumentTable, DocumentTable]], list[DocumentTable], list[DocumentTable], list[str]]:
    paired_tables: list[tuple[DocumentTable, DocumentTable]] = []
    warnings: list[str] = []
    matched_source_ids: set[int] = set()
    matched_target_ids: set[int] = set()

    for key_builder in (_caption_identity, _header_identity):
        source_buckets = _build_table_identity_buckets(source_tables, matched_source_ids, key_builder)
        target_buckets = _build_table_identity_buckets(target_tables, matched_target_ids, key_builder)
        for identity in sorted(set(source_buckets) & set(target_buckets)):
            source_bucket = source_buckets[identity]
            target_bucket = target_buckets[identity]
            if len(source_bucket) == 1 and len(target_bucket) == 1:
                source_table = source_bucket[0]
                target_table = target_bucket[0]
                paired_tables.append((source_table, target_table))
                matched_source_ids.add(source_table.id)
                matched_target_ids.add(target_table.id)

    remaining_source = sorted(
        [table for table in source_tables if table.id not in matched_source_ids],
        key=lambda table: table.table_order_index,
    )
    remaining_target = sorted(
        [table for table in target_tables if table.id not in matched_target_ids],
        key=lambda table: table.table_order_index,
    )

    if remaining_source and remaining_target:
        warnings.append("Compare used table order fallback for one or more tables.")
        paired_count = min(len(remaining_source), len(remaining_target))
        paired_tables.extend(
            list(zip(remaining_source[:paired_count], remaining_target[:paired_count], strict=True))
        )
        remaining_source = remaining_source[paired_count:]
        remaining_target = remaining_target[paired_count:]

    return paired_tables, remaining_source, remaining_target, warnings


def _build_table_identity_buckets(
    tables: list[DocumentTable],
    matched_ids: set[int],
    key_builder,
) -> dict[tuple[str, str], list[DocumentTable]]:
    buckets: dict[tuple[str, str], list[DocumentTable]] = defaultdict(list)
    for table in tables:
        if table.id in matched_ids:
            continue
        identity = key_builder(table)
        if identity is not None:
            buckets[identity].append(table)
    return buckets


def _caption_identity(table: DocumentTable) -> tuple[str, str] | None:
    caption = _normalize_optional_text(table.normalized_caption_text)
    if not caption:
        return None
    return (caption, _section_signature(table.section_title))


def _header_identity(table: DocumentTable) -> tuple[str, str] | None:
    columns = sorted(table.columns, key=lambda column: column.column_index)
    if not columns:
        return None
    header_signature = tuple(_normalize_optional_text(column.normalized_header_text) for column in columns)
    return (json.dumps(header_signature), _section_signature(table.section_title))


def _compare_table_pair(
    compare_run: CompareRun,
    source_table: DocumentTable,
    target_table: DocumentTable,
) -> tuple[list[ChangeItem], list[str]]:
    change_items: list[ChangeItem] = []
    warnings: list[str] = []

    source_header_rows = [row for row in _sorted_rows(source_table.rows) if row.is_header_row]
    target_header_rows = [row for row in _sorted_rows(target_table.rows) if row.is_header_row]
    change_items.extend(_compare_header_rows(compare_run, source_header_rows, target_header_rows))

    source_data_rows = [row for row in _sorted_rows(source_table.rows) if not row.is_header_row]
    target_data_rows = [row for row in _sorted_rows(target_table.rows) if not row.is_header_row]

    candidate_key = _select_candidate_key(source_table, target_table, source_data_rows, target_data_rows)
    if candidate_key is not None:
        paired_rows, unpaired_source, unpaired_target = _align_rows_by_candidate_key(
            source_data_rows,
            target_data_rows,
            candidate_key,
        )
    else:
        warnings.append(
            f"Table row alignment fell back for {target_table.surface.surface_type}/{target_table.surface.surface_key} {target_table.table_key}."
        )
        if len(source_data_rows) == len(target_data_rows):
            paired_rows = list(zip(source_data_rows, target_data_rows, strict=True))
            unpaired_source = []
            unpaired_target = []
        else:
            paired_rows = []
            unpaired_source = source_data_rows
            unpaired_target = target_data_rows

    for source_row, target_row in paired_rows:
        source_block = source_row.document_block
        target_block = target_row.document_block
        if source_block.normalized_content == target_block.normalized_content:
            continue
        change_items.append(
            _build_change_item(
                compare_run,
                "modified",
                source_block,
                target_block,
                structured_diff_json=_build_structured_diff_json(source_row, target_row),
            )
        )

    for source_row in unpaired_source:
        change_items.append(_build_change_item(compare_run, "removed", source_row.document_block, None))
    for target_row in unpaired_target:
        change_items.append(_build_change_item(compare_run, "added", None, target_row.document_block))

    return change_items, warnings


def _compare_header_rows(
    compare_run: CompareRun,
    source_rows: list[DocumentTableRow],
    target_rows: list[DocumentTableRow],
) -> list[ChangeItem]:
    change_items: list[ChangeItem] = []
    paired_count = min(len(source_rows), len(target_rows))

    for index in range(paired_count):
        source_block = source_rows[index].document_block
        target_block = target_rows[index].document_block
        if source_block.normalized_content == target_block.normalized_content:
            continue
        change_items.append(
            _build_change_item(
                compare_run,
                "modified",
                source_block,
                target_block,
                structured_diff_json=_build_structured_diff_json(source_rows[index], target_rows[index]),
            )
        )

    for row in source_rows[paired_count:]:
        change_items.append(_build_change_item(compare_run, "removed", row.document_block, None))
    for row in target_rows[paired_count:]:
        change_items.append(_build_change_item(compare_run, "added", None, row.document_block))

    return change_items


def _select_candidate_key(
    source_table: DocumentTable,
    target_table: DocumentTable,
    source_rows: list[DocumentTableRow],
    target_rows: list[DocumentTableRow],
) -> tuple[str, str] | None:
    source_columns = sorted(source_table.columns, key=lambda column: column.column_index)
    target_columns = sorted(target_table.columns, key=lambda column: column.column_index)

    for family in _KEY_FAMILY_PRIORITY:
        source_candidates = [column for column in source_columns if _canonical_header_family(column.normalized_header_text) == family]
        target_candidates = [column for column in target_columns if _canonical_header_family(column.normalized_header_text) == family]
        for source_column in source_candidates:
            for target_column in target_candidates:
                if _column_pair_is_valid(source_rows, target_rows, source_column.column_key, target_column.column_key):
                    return (source_column.column_key, target_column.column_key)

    for source_column in source_columns:
        for target_column in target_columns:
            if source_column.column_index == target_column.column_index or _normalize_optional_text(
                source_column.normalized_header_text
            ) == _normalize_optional_text(target_column.normalized_header_text):
                if _column_pair_is_valid(source_rows, target_rows, source_column.column_key, target_column.column_key):
                    return (source_column.column_key, target_column.column_key)

    return None


def _column_pair_is_valid(
    source_rows: list[DocumentTableRow],
    target_rows: list[DocumentTableRow],
    source_column_key: str,
    target_column_key: str,
) -> bool:
    source_values = _non_empty_row_values(source_rows, source_column_key)
    target_values = _non_empty_row_values(target_rows, target_column_key)
    if not source_rows or not target_rows or not source_values or not target_values:
        return False

    source_coverage = len(source_values) / len(source_rows)
    target_coverage = len(target_values) / len(target_rows)
    return (
        source_coverage >= 0.8
        and target_coverage >= 0.8
        and len(source_values) == len(set(source_values))
        and len(target_values) == len(set(target_values))
    )


def _align_rows_by_candidate_key(
    source_rows: list[DocumentTableRow],
    target_rows: list[DocumentTableRow],
    candidate_key: tuple[str, str],
) -> tuple[list[tuple[DocumentTableRow, DocumentTableRow]], list[DocumentTableRow], list[DocumentTableRow]]:
    source_column_key, target_column_key = candidate_key
    source_lookup = {
        _row_value(row, source_column_key): row
        for row in source_rows
        if _row_value(row, source_column_key)
    }
    matched_values: set[str] = set()
    paired_rows: list[tuple[DocumentTableRow, DocumentTableRow]] = []

    for target_row in sorted(target_rows, key=lambda row: row.row_index):
        value = _row_value(target_row, target_column_key)
        if value and value in source_lookup:
            paired_rows.append((source_lookup[value], target_row))
            matched_values.add(value)

    unpaired_source = [
        row for row in source_rows if not (_row_value(row, source_column_key) and _row_value(row, source_column_key) in matched_values)
    ]
    unpaired_target = [
        row for row in target_rows if not (_row_value(row, target_column_key) and _row_value(row, target_column_key) in matched_values)
    ]
    return paired_rows, unpaired_source, unpaired_target


def _build_change_item(
    compare_run: CompareRun,
    change_type: str,
    source_block: DocumentBlock | None,
    target_block: DocumentBlock | None,
    *,
    structured_diff_json: str | None = None,
) -> ChangeItem:
    context_block = target_block or source_block
    assert context_block is not None
    table_key = context_block.table_row.table.table_key if context_block.table_row is not None else None
    row_key = context_block.table_row.row_key if context_block.table_row is not None else None
    container_type = "table" if context_block.block_type == "table_row" else "text_flow"
    container_key = table_key or context_block.surface.surface_key

    old_content = source_block.raw_content if source_block is not None else None
    new_content = target_block.raw_content if target_block is not None else None

    if change_type == "modified":
        summary = f"Modified {context_block.block_type} in {context_block.surface.surface_type}"
    elif change_type == "removed":
        summary = f"Removed {context_block.block_type} from {context_block.surface.surface_type}"
    else:
        summary = f"Added {context_block.block_type} in {context_block.surface.surface_type}"

    return ChangeItem(
        compare_run=compare_run,
        source_version_id=compare_run.source_version_id,
        target_version_id=compare_run.target_version_id,
        source_block_id=source_block.id if source_block is not None else None,
        target_block_id=target_block.id if target_block is not None else None,
        change_type=change_type,
        section_title=context_block.section_title,
        surface_type=context_block.surface.surface_type,
        surface_key=context_block.surface.surface_key,
        container_type=container_type,
        container_key=container_key,
        table_key=table_key,
        row_key=row_key,
        old_content=old_content,
        new_content=new_content,
        summary=summary,
        change_context_json=json.dumps(
            {
                "source_block_id": source_block.id if source_block is not None else None,
                "target_block_id": target_block.id if target_block is not None else None,
                "block_type": context_block.block_type,
                "surface_type": context_block.surface.surface_type,
                "surface_key": context_block.surface.surface_key,
            },
            separators=(",", ":"),
            ensure_ascii=True,
        ),
        structured_diff_json=structured_diff_json,
    )


def _build_structured_diff_json(source_row: DocumentTableRow, target_row: DocumentTableRow) -> str | None:
    source_cells = _row_cells(source_row)
    target_cells = _row_cells(target_row)
    source_by_key = {cell["column_key"]: cell for cell in source_cells}
    source_by_index = {cell["column_index"]: cell for cell in source_cells}

    changed_columns: list[dict[str, object]] = []
    used_source_keys: set[str] = set()

    for target_cell in target_cells:
        source_cell = source_by_key.get(target_cell["column_key"])
        if source_cell is None:
            source_cell = source_by_index.get(target_cell["column_index"])
        if source_cell is None:
            source_cell = _find_source_cell_by_header_family(source_cells, target_cell)

        if source_cell is not None:
            used_source_keys.add(source_cell["column_key"])

        old_value = source_cell["raw_value"] if source_cell is not None else None
        new_value = target_cell["raw_value"]
        old_normalized = _cell_compare_value(source_cell) if source_cell is not None else None
        new_normalized = _cell_compare_value(target_cell)

        if old_normalized != new_normalized:
            changed_columns.append(
                {
                    "column_key": target_cell["column_key"],
                    "header_text": target_cell["header_text"],
                    "old_value": old_value,
                    "new_value": new_value,
                }
            )

    for source_cell in source_cells:
        if source_cell["column_key"] in used_source_keys:
            continue
        changed_columns.append(
            {
                "column_key": source_cell["column_key"],
                "header_text": source_cell["header_text"],
                "old_value": source_cell["raw_value"],
                "new_value": None,
            }
        )

    if not changed_columns:
        return None

    return json.dumps(
        {"changed_columns": changed_columns},
        separators=(",", ":"),
        ensure_ascii=True,
    )


def _find_source_cell_by_header_family(
    source_cells: list[dict[str, object]],
    target_cell: dict[str, object],
) -> dict[str, object] | None:
    target_family = _canonical_header_family(target_cell["normalized_header_text"])
    if target_family is None:
        return None
    candidates = [
        cell
        for cell in source_cells
        if _canonical_header_family(cell["normalized_header_text"]) == target_family
    ]
    return candidates[0] if len(candidates) == 1 else None


def _build_summary(change_items: list[ChangeItem]) -> dict[str, int]:
    summary = _empty_summary()
    for change_item in change_items:
        summary["total_changes"] += 1
        summary[change_item.change_type] += 1
    return summary


def _empty_summary() -> dict[str, int]:
    return {
        "total_changes": 0,
        "added": 0,
        "removed": 0,
        "modified": 0,
    }


def _parse_summary(summary_json: str | None) -> dict[str, int]:
    if not summary_json:
        return _empty_summary()
    payload = json.loads(summary_json)
    return {
        "total_changes": int(payload.get("total_changes", 0)),
        "added": int(payload.get("added", 0)),
        "removed": int(payload.get("removed", 0)),
        "modified": int(payload.get("modified", 0)),
    }


def _parse_warnings(summary_json: str | None) -> list[str]:
    if not summary_json:
        return []
    payload = json.loads(summary_json)
    return [str(item) for item in payload.get("warnings", [])]


def _has_ai_review_drafts(session: Session, compare_run_id: int) -> bool:
    statement = (
        select(AIReviewDraft.id)
        .join(ChangeItem, ChangeItem.id == AIReviewDraft.change_item_id)
        .where(ChangeItem.compare_run_id == compare_run_id)
        .limit(1)
    )
    return session.scalar(statement) is not None


def _impact_summary_ready(session: Session, compare_run_id: int) -> bool:
    statement = (
        select(ChangeItemRequirementLink.id)
        .join(ChangeItem, ChangeItem.id == ChangeItemRequirementLink.change_item_id)
        .where(ChangeItem.compare_run_id == compare_run_id)
        .limit(1)
    )
    return session.scalar(statement) is not None


def _load_active_job_item_statuses(session: Session, compare_run_id: int) -> dict[int, str]:
    active_job = session.scalar(
        select(AIBatchJob)
        .where(AIBatchJob.compare_run_id == compare_run_id, AIBatchJob.status.in_(("queued", "running")))
        .order_by(AIBatchJob.id.desc())
    )
    if active_job is None:
        return {}

    items = list(
        session.scalars(select(AIBatchJobItem).where(AIBatchJobItem.job_id == active_job.id))
    )
    return {item.change_item_id: item.status for item in items}


def _resolve_ai_generation_status(change_item: ChangeItem, active_job_item_status: str | None) -> str:
    if change_item.ai_review_draft is not None:
        return change_item.ai_review_draft.generation_status
    if active_job_item_status in {"queued", "running"}:
        return "pending"
    if active_job_item_status in {"generated", "failed"}:
        return active_job_item_status
    return "not_requested"


def _build_sort_key(change_item: ChangeItem) -> str:
    anchor_block = change_item.target_block or change_item.source_block
    if anchor_block is None:
        return f"9999:999999:999999:{change_item.id:08d}"
    return (
        f"{anchor_block.surface.logical_order_index:04d}:"
        f"{anchor_block.surface_order_index:06d}:"
        f"{0 if change_item.target_block_id is not None else 1:01d}:"
        f"{change_item.id:08d}"
    )


def _normalize_optional_text(value: str | None) -> str:
    return " ".join((value or "").split()).strip().lower()


def _sorted_partition_keys(partition_keys: set[tuple[str, str]]) -> list[tuple[str, str]]:
    return sorted(partition_keys, key=lambda item: (item[0], item[1]))


def _sorted_rows(rows: list[DocumentTableRow]) -> list[DocumentTableRow]:
    return sorted(rows, key=lambda row: row.row_index)


def _canonical_header_family(header_text: str | None) -> str | None:
    normalized = _normalize_optional_text(header_text)
    for family, aliases in _KEY_FAMILY_ALIASES.items():
        if normalized in aliases:
            return family
    return None


def _row_cells(row: DocumentTableRow) -> list[dict[str, object]]:
    payload = json.loads(row.structured_row_json)
    return list(payload.get("cells", []))


def _row_value(row: DocumentTableRow, column_key: str) -> str:
    for cell in _row_cells(row):
        if cell["column_key"] == column_key:
            return _cell_compare_value(cell)
    return ""


def _non_empty_row_values(rows: list[DocumentTableRow], column_key: str) -> list[str]:
    return [value for value in (_row_value(row, column_key) for row in rows) if value]


def _cell_compare_value(cell: dict[str, object] | None) -> str:
    if cell is None:
        return ""
    normalized_value = str(cell.get("normalized_value") or "")
    if normalized_value == "__EMPTY__":
        return ""
    return normalized_value
