from datetime import datetime

from pydantic import BaseModel


class AIBatchJobRead(BaseModel):
    job_id: int
    compare_run_id: int
    status: str
    requested_count: int
    processed_count: int
    generated_count: int
    failed_count: int
    force_regenerate: bool
    use_rag: bool
    active: bool
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None


class AIBatchJobItemRead(BaseModel):
    job_item_id: int
    change_item_id: int
    status: str
    provider_used: str | None = None
    fallback_used: bool = False
    error_message: str | None = None
    attempt_count: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
