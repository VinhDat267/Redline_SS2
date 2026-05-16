from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ReadModel
from app.schemas.document import DocumentRead
from app.schemas.document_version import DocumentVersionRead


class DocumentParseRunRead(ReadModel):
    id: int
    document_version_id: int
    parser_version: str
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    warning_count: int
    error_message: str | None = None


class ParserDiagnosticRead(BaseModel):
    code: str
    severity: str
    category: str
    policy_impact: str
    source_part: str
    source_path: str | None = None
    relationship_id: str | None = None
    occurrence_key: str
    surface_type: str | None = None
    message: str
    count: int
    text_samples: list[str] = Field(default_factory=list)
    samples: list[str] | None = None
    metadata: dict[str, object] | None = None


class ParserCoverageRead(BaseModel):
    policy_result: str
    canonical_text_length: int
    secondary_text_length: int
    expected_token_count: int
    matched_expected_token_count: int | None = None
    diagnostic_only_token_count: int | None = None
    ignored_token_count: int | None = None
    coverage_ratio: float | None = None
    unmatched_text_samples: list[str] = Field(default_factory=list)
    retained_token_count: int | None = None
    low_confidence_token_ratio: float | None = None


class ParserPdfSummaryRead(BaseModel):
    page_count: int
    text_layer_page_count: int
    ocr_page_count: int
    failed_page_count: int
    table_like_page_count: int
    extraction_modes_by_page: dict[str, str]
    ocr_languages: str
    average_ocr_confidence: float | None = None


class ParserWorkspaceSummaryRead(BaseModel):
    total_surfaces: int
    total_blocks: int
    table_count: int
    row_count: int
    warning_count: int
    coverage: ParserCoverageRead | None = None
    diagnostics: list[ParserDiagnosticRead] = Field(default_factory=list)
    pdf: ParserPdfSummaryRead | None = None


class ParserSurfaceGroupEntryRead(BaseModel):
    id: int
    surface_key: str
    surface_type: str
    label: str
    item_count: int


class ParserSurfaceGroupsRead(BaseModel):
    body: list[ParserSurfaceGroupEntryRead] = Field(default_factory=list)
    headers: list[ParserSurfaceGroupEntryRead] = Field(default_factory=list)
    footers: list[ParserSurfaceGroupEntryRead] = Field(default_factory=list)
    footnotes: list[ParserSurfaceGroupEntryRead] = Field(default_factory=list)
    endnotes: list[ParserSurfaceGroupEntryRead] = Field(default_factory=list)
    pages: list[ParserSurfaceGroupEntryRead] = Field(default_factory=list)


class CompareReadinessRead(BaseModel):
    is_ready: bool
    status: str
    message: str


class ParserWorkspaceRead(BaseModel):
    document: DocumentRead
    versions: list[DocumentVersionRead]
    selected_version: DocumentVersionRead
    parse_run: DocumentParseRunRead | None = None
    summary: ParserWorkspaceSummaryRead
    surface_groups: ParserSurfaceGroupsRead
    compare_readiness: CompareReadinessRead


class ParserSurfaceRead(BaseModel):
    id: int
    surface_key: str
    surface_type: str
    label: str
    logical_order_index: int


class ParserSurfaceItemRead(BaseModel):
    kind: str
    block_id: int | None = None
    block_type: str | None = None
    section_title: str | None = None
    surface_order_index: int
    raw_content: str | None = None
    normalized_content: str | None = None
    table_id: int | None = None
    table_key: str | None = None
    row_count: int | None = None


class ParserTableColumnRead(BaseModel):
    column_key: str
    column_index: int
    header_text: str


class ParserTableCellRead(BaseModel):
    column_key: str
    column_index: int
    raw_value: str
    normalized_value: str
    merge_origin_key: str | None = None
    row_span: int
    col_span: int


class ParserTableRowRead(BaseModel):
    row_key: str
    row_index: int
    is_header_row: bool
    cells: list[ParserTableCellRead]


class ParserTableRead(BaseModel):
    id: int
    table_key: str
    header_strategy: str
    section_title: str | None = None
    columns: list[ParserTableColumnRead]
    rows: list[ParserTableRowRead]


class ParserSurfaceDetailRead(BaseModel):
    surface: ParserSurfaceRead
    items: list[ParserSurfaceItemRead]
    tables: list[ParserTableRead]
