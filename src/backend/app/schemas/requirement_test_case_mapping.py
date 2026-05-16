from datetime import datetime

from pydantic import BaseModel


class RequirementTestCaseMappingCreate(BaseModel):
    test_case_id: int
    notes: str | None = None


class RequirementTestCaseMappingRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    requirement_id: int
    test_case_id: int
    mapping_type: str
    notes: str | None = None
    created_at: datetime
