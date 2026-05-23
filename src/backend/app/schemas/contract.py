from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ReadModel


class ContractCreate(BaseModel):
    title: str
    contract_type: str | None = None
    description: str | None = None


class ContractUpdate(BaseModel):
    title: str | None = None
    contract_type: str | None = None
    description: str | None = None


class ContractRead(ReadModel):
    id: int
    project_id: int
    title: str
    contract_type: str | None = None
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class ContractDraftRead(ReadModel):
    id: int
    contract_id: int
    draft_label: str
    file_name: str
    file_path: str
    uploaded_by_user_id: int | None = None
    parse_status: str
    parsed_snapshot: str | None = None
    uploaded_at: datetime
    notes: str | None = None
    uploaded_by_display_name: str | None = None
    active_parse_run_id: int | None = None
    warning_count: int = 0
    parser_version: str | None = None


class ContractDraftUpdate(BaseModel):
    draft_label: str | None = None
    notes: str | None = None


class ContractSummaryRead(BaseModel):
    id: int
    project_id: int
    title: str
    contract_type: str | None = None
    description: str | None = None


class ContractDraftSummaryRead(BaseModel):
    id: int
    contract_id: int
    draft_label: str
    parse_status: str
    active_parse_run_id: int | None = None
    warning_count: int = 0
    parser_version: str | None = None


class ContractCompareCreate(BaseModel):
    source_draft_id: int
    target_draft_id: int


class ContractCompareCountsRead(BaseModel):
    total_changes: int
    added: int
    removed: int
    modified: int


class ContractCompareRunRead(BaseModel):
    id: int
    compare_version: str
    compare_status: str
    started_at: datetime
    completed_at: datetime | None = None
    warning_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    contract: ContractSummaryRead
    source_draft: ContractDraftSummaryRead
    target_draft: ContractDraftSummaryRead
    summary: ContractCompareCountsRead
    selected_clause_change_id: int | None = None
    has_ai_clause_risk_analyses: bool = False


class ClauseChangeRead(BaseModel):
    id: int
    compare_run_id: int
    change_type: str
    review_status: str
    clause_title: str | None = None
    surface_type: str
    surface_key: str
    container_type: str | None = None
    container_key: str | None = None
    table_key: str | None = None
    row_key: str | None = None
    old_text: str | None = None
    new_text: str | None = None
    summary: str | None = None
    ai_generation_status: str = "not_requested"
    has_ai_clause_risk_analysis: bool = False
    sort_key: str


class ChatSessionCreate(BaseModel):
    draft_id: int
    compare_run_id: int | None = None
    title: str | None = Field(default=None, max_length=255)


class ChatSessionRead(ReadModel):
    id: int
    contract_id: int
    draft_id: int
    compare_run_id: int | None = None
    scope_type: str = "draft"
    title: str | None = None
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime


class ChatCitationRead(BaseModel):
    block_id: int
    block_key: str
    section_title: str | None = None
    surface_type: str
    surface_key: str
    content: str
    source_label: str | None = None
    compare_run_id: int | None = None
    change_item_id: int | None = None


class ContractChatMessageCreate(BaseModel):
    query: str = Field(min_length=1, max_length=4000)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Query cannot be blank")
        return stripped


class ContractChatMessageRead(ReadModel):
    id: int
    role: str
    content: str
    citations: list[ChatCitationRead] = Field(default_factory=list)
    provider_used: str | None = None
    created_at: datetime
    updated_at: datetime


class ContractChatExchangeRead(BaseModel):
    session_id: int
    user_message: ContractChatMessageRead
    assistant_message: ContractChatMessageRead


class ChatAttemptCreate(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    draft_id: int
    client_request_id: str = Field(min_length=1, max_length=120)
    supersedes_attempt_id: int | None = None

    @field_validator("query", "client_request_id")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class ChatAttemptRead(ReadModel):
    id: int
    session_id: int
    draft_id: int
    user_message_id: int
    supersedes_attempt_id: int | None = None
    status: str
    provider_used: str | None = None
    client_request_id: str
    error_code: str | None = None
    error_detail: str | None = None
    created_at: datetime
    updated_at: datetime


class ContractChatAttemptCreateRead(BaseModel):
    session_id: int
    user_message: ContractChatMessageRead
    attempt: ChatAttemptRead
    stream_endpoint: str
    cancel_endpoint: str
