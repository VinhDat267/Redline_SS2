from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ReadModel


class DocumentCreate(BaseModel):
    title: str
    document_type: str | None = None
    description: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    document_type: str | None = None
    description: str | None = None


class DocumentRead(ReadModel):
    id: int
    project_id: int
    title: str
    document_type: str | None = None
    description: str | None = None
    created_at: datetime
    updated_at: datetime
