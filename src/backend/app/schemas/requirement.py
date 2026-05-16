from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ReadModel


class RequirementCreate(BaseModel):
    document_id: int
    requirement_code: str
    title: str
    description: str | None = None
    source_section: str | None = None
    source_block_key: str | None = None
    status: str | None = None


class RequirementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    source_section: str | None = None
    source_block_key: str | None = None
    status: str | None = None


class RequirementRead(ReadModel):
    id: int
    document_id: int
    requirement_code: str
    title: str
    description: str | None = None
    source_section: str | None = None
    source_block_key: str | None = None
    status: str | None = None
    created_at: datetime
    updated_at: datetime
