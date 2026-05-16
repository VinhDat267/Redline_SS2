from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TestCase
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate
from app.services.projects import get_project_or_404


def list_test_cases(session: Session, project_id: int) -> list[TestCase]:
    return list(
        session.scalars(
            select(TestCase).where(TestCase.project_id == project_id).order_by(TestCase.id)
        )
    )


def get_test_case_or_404(session: Session, test_case_id: int) -> TestCase:
    test_case = session.get(TestCase, test_case_id)
    if test_case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")
    return test_case


def create_test_case(session: Session, project_id: int, payload: TestCaseCreate) -> TestCase:
    get_project_or_404(session, project_id)
    test_case = TestCase(project_id=project_id, **payload.model_dump())
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return test_case


def update_test_case(session: Session, test_case: TestCase, payload: TestCaseUpdate) -> TestCase:
    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(test_case, field_name, value)
    session.add(test_case)
    session.commit()
    session.refresh(test_case)
    return test_case


def delete_test_case(session: Session, test_case: TestCase) -> None:
    session.delete(test_case)
    session.commit()
