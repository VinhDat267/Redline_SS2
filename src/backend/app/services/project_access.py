from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AIBatchJob, ChangeItem, CompareRun, Document, DocumentVersion, Project, ProjectMember, Requirement, TestCase


PROJECT_ADMIN_ROLES = {"owner", "admin"}


def list_projects_for_user(session: Session, user_id: int) -> list[Project]:
    return list(
        session.scalars(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user_id)
            .order_by(Project.id)
        )
    )


def ensure_project_access_or_404(session: Session, project_id: int, user_id: int) -> Project:
    project = session.get(Project, project_id)
    if project is None or not _has_project_access(session, project_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def ensure_project_admin_or_403(session: Session, project_id: int, user_id: int) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    membership = session.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not is_project_admin_role(membership.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project owner access required")
    return project


def is_project_admin_role(role: str | None) -> bool:
    return (role or "").strip().lower() in PROJECT_ADMIN_ROLES


def ensure_document_access_or_404(session: Session, document_id: int, user_id: int) -> Document:
    document = session.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    ensure_project_access_or_404(session, document.project_id, user_id)
    return document


def ensure_document_version_access_or_404(session: Session, version_id: int, user_id: int) -> DocumentVersion:
    version = session.get(DocumentVersion, version_id)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document version not found")
    ensure_document_access_or_404(session, version.document_id, user_id)
    return version


def ensure_requirement_access_or_404(session: Session, requirement_id: int, user_id: int) -> Requirement:
    requirement = session.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")

    document = session.get(Document, requirement.document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")

    ensure_project_access_or_404(session, document.project_id, user_id)
    return requirement


def ensure_test_case_access_or_404(session: Session, test_case_id: int, user_id: int) -> TestCase:
    test_case = session.get(TestCase, test_case_id)
    if test_case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test case not found")
    ensure_project_access_or_404(session, test_case.project_id, user_id)
    return test_case


def ensure_compare_run_access_or_404(session: Session, compare_run_id: int, user_id: int) -> CompareRun:
    compare_run = session.get(CompareRun, compare_run_id)
    if compare_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")

    source_version = session.get(DocumentVersion, compare_run.source_version_id)
    if source_version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")

    ensure_document_access_or_404(session, source_version.document_id, user_id)
    return compare_run


def ensure_change_item_access_or_404(session: Session, change_item_id: int, user_id: int) -> ChangeItem:
    change_item = session.get(ChangeItem, change_item_id)
    if change_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change item not found")

    compare_run = session.get(CompareRun, change_item.compare_run_id)
    if compare_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change item not found")

    ensure_compare_run_access_or_404(session, compare_run.id, user_id)
    return change_item


def ensure_ai_batch_job_access_or_404(session: Session, job_id: int, user_id: int) -> AIBatchJob:
    job = session.get(AIBatchJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI batch job not found")

    ensure_compare_run_access_or_404(session, job.compare_run_id, user_id)
    return job


def _has_project_access(session: Session, project_id: int, user_id: int) -> bool:
    membership = (
        session.query(ProjectMember.id)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    return membership is not None
