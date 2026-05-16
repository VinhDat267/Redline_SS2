from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.requirement_test_case_mapping import (
    RequirementTestCaseMappingCreate,
    RequirementTestCaseMappingRead,
)
from app.services import project_access as project_access_service
from app.services import requirement_test_case_mappings as mapping_service


router = APIRouter(tags=["requirement-test-case-mappings"], dependencies=[Depends(get_current_user)])


@router.get("/requirements/{requirement_id}/test-case-mappings")
def list_requirement_test_case_mappings(
    requirement_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_requirement_access_or_404(database, requirement_id, current_user.id)
    mappings = mapping_service.list_mappings_for_requirement(database, requirement_id)
    return {
        "data": [
            RequirementTestCaseMappingRead.model_validate(m).model_dump(mode="json")
            for m in mappings
        ]
    }


@router.post("/requirements/{requirement_id}/test-case-mappings", status_code=status.HTTP_201_CREATED)
def create_requirement_test_case_mapping(
    requirement_id: int,
    payload: RequirementTestCaseMappingCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_requirement_access_or_404(database, requirement_id, current_user.id)
    mapping = mapping_service.create_mapping(
        database,
        requirement_id=requirement_id,
        test_case_id=payload.test_case_id,
        notes=payload.notes,
    )
    return {"data": RequirementTestCaseMappingRead.model_validate(mapping).model_dump(mode="json")}


@router.delete(
    "/requirements/{requirement_id}/test-case-mappings/{test_case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_requirement_test_case_mapping(
    requirement_id: int,
    test_case_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_requirement_access_or_404(database, requirement_id, current_user.id)
    mapping_service.delete_mapping(database, requirement_id, test_case_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
