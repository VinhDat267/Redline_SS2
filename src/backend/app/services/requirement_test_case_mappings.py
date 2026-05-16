from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Requirement, RequirementTestCaseMapping, TestCase


def list_mappings_for_requirement(session: Session, requirement_id: int) -> list[RequirementTestCaseMapping]:
    _get_requirement_or_404(session, requirement_id)
    return list(
        session.scalars(
            select(RequirementTestCaseMapping)
            .where(RequirementTestCaseMapping.requirement_id == requirement_id)
            .order_by(RequirementTestCaseMapping.id)
        )
    )


def create_mapping(
    session: Session,
    requirement_id: int,
    test_case_id: int,
    notes: str | None = None,
) -> RequirementTestCaseMapping:
    requirement = _get_requirement_or_404(session, requirement_id)
    test_case = session.get(TestCase, test_case_id)
    if test_case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")

    # Verify both belong to same project
    # Requirement -> Document -> project_id; TestCase -> project_id directly
    from app.models import Document
    req_doc = session.get(Document, requirement.document_id)
    if req_doc is None or req_doc.project_id != test_case.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requirement and Test Case belong to different projects",
        )

    existing = session.scalar(
        select(RequirementTestCaseMapping)
        .where(
            RequirementTestCaseMapping.requirement_id == requirement_id,
            RequirementTestCaseMapping.test_case_id == test_case_id,
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mapping already exists")

    mapping = RequirementTestCaseMapping(
        requirement_id=requirement_id,
        test_case_id=test_case_id,
        mapping_type="manual",
        notes=notes,
    )
    session.add(mapping)
    session.commit()
    session.refresh(mapping)
    return mapping


def delete_mapping(session: Session, requirement_id: int, test_case_id: int) -> None:
    _get_requirement_or_404(session, requirement_id)
    mapping = session.scalar(
        select(RequirementTestCaseMapping)
        .where(
            RequirementTestCaseMapping.requirement_id == requirement_id,
            RequirementTestCaseMapping.test_case_id == test_case_id,
        )
    )
    if mapping is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mapping not found")
    session.delete(mapping)
    session.commit()


def _get_requirement_or_404(session: Session, requirement_id: int) -> Requirement:
    requirement = session.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")
    return requirement
