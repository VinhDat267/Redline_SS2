from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ReadModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectRead(ReadModel):
    id: int
    name: str
    description: str | None = None
    document_count: int = 0
    created_at: datetime
    updated_at: datetime
