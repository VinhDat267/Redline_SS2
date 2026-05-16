from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.ai_batch_job import AIBatchJobRead
from app.schemas.common import ReadModel


class CompareCreate(BaseModel):
    source_version_id: int
    target_version_id: int


class CompareCountsRead(BaseModel):
    total_changes: int
    added: int
    removed: int
    modified: int


class CompareVersionRead(ReadModel):
    id: int
    document_id: int
    version_label: str
    parse_status: str
    active_parse_run_id: int | None = None
    warning_count: int = 0
    parser_version: str | None = None


class CompareDocumentRead(ReadModel):
    id: int
    project_id: int
    title: str
    document_type: str | None = None
    description: str | None = None


class CompareRunRead(BaseModel):
    id: int
    compare_version: str
    compare_status: str
    started_at: datetime
    completed_at: datetime | None = None
    warning_count: int = 0
    warnings: list[str] = []
    document: CompareDocumentRead
    source_version: CompareVersionRead
    target_version: CompareVersionRead
    summary: CompareCountsRead
    selected_change_item_id: int | None = None
    has_ai_review_drafts: bool = False
    impact_summary_ready: bool = False
    active_ai_batch_job: AIBatchJobRead | None = None
    ai_batch_summary: AIBatchJobRead | None = None


class CompareQueueItemRead(BaseModel):
    id: int
    compare_run_id: int
    change_type: str
    review_status: str
    section_title: str | None = None
    surface_type: str
    surface_key: str
    container_type: str | None = None
    container_key: str | None = None
    table_key: str | None = None
    row_key: str | None = None
    old_content: str | None = None
    new_content: str | None = None
    summary: str | None = None
    ai_generation_status: str = "not_requested"
    has_ai_review_draft: bool = False
    sort_key: str


class ChangeItemUpdate(BaseModel):
    review_status: str | None = None
    assignee_user_id: int | None = None
    summary: str | None = None


class ReviewCommentCreate(BaseModel):
    content: str


class ReviewCommentRead(BaseModel):
    id: int
    author_user_id: int
    author_display_name: str | None = None
    content: str
    created_at: datetime


class ImpactedTestRead(BaseModel):
    test_case_id: int
    test_case_code: str
    title: str
    priority: str | None = None
    status: str | None = None


class LinkedRequirementRead(BaseModel):
    requirement_id: int
    requirement_code: str
    title: str
    link_type: str
    notes: str | None = None
    mapped_test_cases: list[ImpactedTestRead] = Field(default_factory=list)


class AIReviewDraftRead(BaseModel):
    id: int
    suggested_assignee_user_id: int | None = None
    recommended_review_status: str | None = None
    explanation: str
    risk_level: str | None = None
    draft_comment: str | None = None
    suggested_checks: str | None = None
    confidence: float | None = None
    generation_status: str
    provider_used: str | None = None
    fallback_used: bool = False
    error_message: str | None = None
    generated_at: datetime | None = None


class AIReviewDraftGenerateRequest(BaseModel):
    force_regenerate: bool = False
    use_rag: bool = True


class CompareRunAIGenerateRequest(AIReviewDraftGenerateRequest):
    change_item_ids: list[int] | None = None


class AIGenerationResultItemRead(BaseModel):
    change_item_id: int
    generation_status: str
    provider_used: str | None = None
    fallback_used: bool = False
    error_message: str | None = None


class CompareRunAIGenerationResultRead(BaseModel):
    compare_run_id: int
    requested_count: int
    generated_count: int
    failed_count: int
    results: list[AIGenerationResultItemRead]


class ChangeItemAIGenerationResultRead(BaseModel):
    change_item_id: int
    ai_review_draft: AIReviewDraftRead


class ChangeItemDetailRead(BaseModel):
    id: int
    compare_run_id: int
    change_type: str
    review_status: str
    assignee_user_id: int | None = None
    assignee_display_name: str | None = None
    section_title: str | None = None
    surface_type: str
    surface_key: str
    container_type: str | None = None
    container_key: str | None = None
    table_key: str | None = None
    row_key: str | None = None
    old_content: str | None = None
    new_content: str | None = None
    summary: str | None = None
    change_context_json: str | None = None
    structured_diff_json: str | None = None
    linked_requirements: list[LinkedRequirementRead]
    impacted_tests: list[ImpactedTestRead]
    comments: list[ReviewCommentRead]
    ai_review_draft: AIReviewDraftRead | None = None


class CompareRunAISummaryResponse(BaseModel):
    summary_text: str
    provider_used: str
    fallback_used: bool
    error_message: str | None


class LinkedRequirementCreate(BaseModel):
    requirement_id: int
    notes: str | None = None
