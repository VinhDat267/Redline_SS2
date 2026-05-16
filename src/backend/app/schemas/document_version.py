from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ReadModel


class DocumentVersionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version_label: str | None = None
    notes: str | None = None


class DocumentVersionRead(ReadModel):
    id: int
    document_id: int
    version_label: str
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
