from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ReadModel


class RequirementCandidateGenerateRequest(BaseModel):
    force_regenerate: bool = False


class RequirementCandidateRejectRequest(BaseModel):
    reason: str | None = None


class RequirementCandidateRead(ReadModel):
    id: int
    document_version_id: int
    parse_run_id: int
    document_block_id: int | None = None
    accepted_requirement_id: int | None = None
    requirement_code: str
    title: str
    description: str | None = None
    source_section: str | None = None
    source_block_key: str
    confidence: float | None = None
    status: str
    provider_used: str | None = None
    fallback_used: bool
    error_message: str | None = None
    generated_at: datetime
    decided_at: datetime | None = None
    rejection_reason: str | None = None


class RequirementCandidateSummaryRead(BaseModel):
    total: int
    pending: int
    accepted: int
    rejected: int


class RequirementCandidateListRead(BaseModel):
    summary: RequirementCandidateSummaryRead
    candidates: list[RequirementCandidateRead]


class RequirementCandidateGenerationRead(RequirementCandidateListRead):
    provider_used: str | None = None
    fallback_used: bool = False
    error_message: str | None = None
