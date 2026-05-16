from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.test_case import TestCaseCreate, TestCaseRead, TestCaseUpdate
from app.services import project_access as project_access_service
from app.services import test_cases as test_case_service


router = APIRouter(tags=["test-cases"], dependencies=[Depends(get_current_user)])


@router.get("/projects/{project_id}/test-cases")
def list_test_cases(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    test_cases = test_case_service.list_test_cases(database, project_id)
    return {"data": [TestCaseRead.model_validate(test_case).model_dump(mode="json") for test_case in test_cases]}


@router.post("/projects/{project_id}/test-cases", status_code=status.HTTP_201_CREATED)
def create_test_case(
    project_id: int,
    payload: TestCaseCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    test_case = test_case_service.create_test_case(database, project_id, payload)
    return {"data": TestCaseRead.model_validate(test_case).model_dump(mode="json")}


@router.get("/test-cases/{test_case_id}")
def get_test_case(
    test_case_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    test_case = project_access_service.ensure_test_case_access_or_404(database, test_case_id, current_user.id)
    return {"data": TestCaseRead.model_validate(test_case).model_dump(mode="json")}


@router.patch("/test-cases/{test_case_id}")
def update_test_case(
    test_case_id: int,
    payload: TestCaseUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    test_case = project_access_service.ensure_test_case_access_or_404(database, test_case_id, current_user.id)
    test_case = test_case_service.update_test_case(database, test_case, payload)
    return {"data": TestCaseRead.model_validate(test_case).model_dump(mode="json")}


@router.delete("/test-cases/{test_case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_case(
    test_case_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    test_case = project_access_service.ensure_test_case_access_or_404(database, test_case_id, current_user.id)
    test_case_service.delete_test_case(database, test_case)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
