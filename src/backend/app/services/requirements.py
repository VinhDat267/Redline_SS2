from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, Requirement
from app.schemas.requirement import RequirementCreate, RequirementUpdate
from app.services.projects import get_project_or_404


def list_requirements(session: Session, project_id: int) -> list[Requirement]:
    return list(
        session.scalars(
            select(Requirement)
            .join(Document, Requirement.document_id == Document.id)
            .where(Document.project_id == project_id)
            .order_by(Requirement.id)
        )
    )


def get_requirement_or_404(session: Session, requirement_id: int) -> Requirement:
    requirement = session.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")
    return requirement


def create_requirement(session: Session, project_id: int, payload: RequirementCreate) -> Requirement:
    get_project_or_404(session, project_id)
    document = session.get(Document, payload.document_id)
    if document is None or document.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document does not belong to project")

    requirement = Requirement(**payload.model_dump())
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    return requirement


def update_requirement(session: Session, requirement: Requirement, payload: RequirementUpdate) -> Requirement:
    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(requirement, field_name, value)
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    return requirement


def delete_requirement(session: Session, requirement: Requirement) -> None:
    session.delete(requirement)
    session.commit()
