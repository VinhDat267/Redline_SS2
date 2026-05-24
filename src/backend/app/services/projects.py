from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Document, Project, ProjectInvitation, ProjectMember, User
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.project_member import ProjectMemberCreate, ProjectMemberUpdate
from app.services.auth import normalize_email
from app.services import project_access as project_access_service
from app.services import project_invitations as project_invitation_service


def list_projects(session: Session, user_id: int) -> list[Project]:
    return project_access_service.list_projects_for_user(session, user_id)


def get_project_or_404(session: Session, project_id: int) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def count_project_documents(session: Session, project_id: int) -> int:
    return count_projects_documents(session, [project_id]).get(project_id, 0)


def count_projects_documents(session: Session, project_ids: list[int]) -> dict[int, int]:
    unique_project_ids = sorted(set(project_ids))
    if not unique_project_ids:
        return {}

    rows = session.execute(
        select(Document.project_id, func.count(Document.id).label("document_count"))
        .where(Document.project_id.in_(unique_project_ids))
        .group_by(Document.project_id)
    ).all()
    return {row.project_id: int(row.document_count) for row in rows}


def create_project(session: Session, payload: ProjectCreate, owner_user_id: int) -> Project:
    project = Project(name=payload.name, description=payload.description)
    session.add(project)
    session.flush()
    session.add(ProjectMember(project_id=project.id, user_id=owner_user_id, role="owner"))
    session.commit()
    session.refresh(project)
    return project


def update_project(session: Session, project: Project, payload: ProjectUpdate) -> Project:
    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(project, field_name, value)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def delete_project(session: Session, project: Project) -> None:
    session.delete(project)
    session.commit()


def list_project_members(session: Session, project_id: int) -> list[ProjectMember]:
    return list(
        session.scalars(
            select(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.id)
        )
    )


def get_project_member_or_404(session: Session, project_id: int, member_id: int) -> ProjectMember:
    member = session.get(ProjectMember, member_id)
    if member is None or member.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project member not found")
    return member


def create_project_member(
    session: Session,
    project_id: int,
    payload: ProjectMemberCreate,
    invited_by_user_id: int | None,
) -> dict[str, object]:
    get_project_or_404(session, project_id)
    user = None
    normalized_email = normalize_email(payload.user_email) if payload.user_email is not None else None
    if payload.user_id is not None:
        user = session.get(User, payload.user_id)
    elif payload.user_email is not None:
        user = session.scalar(select(User).where(User.email == normalized_email))
        if user is not None and not user.google_sub:
            user = None

    if user is None:
        if payload.user_email is not None:
            invitation = project_invitation_service.create_or_reactivate_project_invitation(
                session,
                project_id,
                payload.user_email,
                payload.role,
                invited_by_user_id,
            )
            return {
                "result_type": "invitation_created",
                "member": None,
                "invitation": invitation,
                "message": "Invitation created for a future account match.",
            }
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing_member = session.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if existing_member is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already exists")

    member = ProjectMember(project_id=project_id, user_id=user.id, role=payload.role)
    session.add(member)
    session.commit()
    session.refresh(member)

    pending_invitation = None
    if normalized_email is not None:
        pending_invitation = session.scalar(
            select(ProjectInvitation).where(
                ProjectInvitation.project_id == project_id,
                ProjectInvitation.email == normalized_email,
                ProjectInvitation.status == "pending",
            )
        )

    if pending_invitation is not None:
        pending_invitation.status = "accepted"
        pending_invitation.accepted_at = pending_invitation.accepted_at or member.joined_at
        session.add(pending_invitation)
        session.commit()

    return {
        "result_type": "member_added",
        "member": member,
        "invitation": None,
        "message": "Project member added.",
    }


def update_project_member(session: Session, member: ProjectMember, payload: ProjectMemberUpdate) -> ProjectMember:
    updates = payload.model_dump(exclude_unset=True)
    if "role" in updates and _is_owner_role(member.role) and not _is_owner_role(updates["role"]):
        _ensure_project_keeps_owner(session, member)
    for field_name, value in updates.items():
        setattr(member, field_name, value)
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def delete_project_member(session: Session, member: ProjectMember) -> None:
    if _is_owner_role(member.role):
        _ensure_project_keeps_owner(session, member)
    session.delete(member)
    session.commit()


def _is_owner_role(role: str | None) -> bool:
    return (role or "").strip().lower() == "owner"


def _ensure_project_keeps_owner(session: Session, member: ProjectMember) -> None:
    owner_count = session.scalar(
        select(func.count(ProjectMember.id)).where(
            ProjectMember.project_id == member.project_id,
            func.lower(ProjectMember.role) == "owner",
        )
    )
    if (owner_count or 0) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project must keep at least one owner",
        )
