from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ReadModel


class TestCaseCreate(BaseModel):
    test_case_code: str
    title: str
    description: str | None = None
    priority: str | None = None
    status: str | None = None


class TestCaseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None


class TestCaseRead(ReadModel):
    id: int
    project_id: int
    test_case_code: str
    title: str
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    created_at: datetime
    updated_at: datetime
