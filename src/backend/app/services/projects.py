from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Document, Project, ProjectInvitation, ProjectMember, User
from app.models.mixins import utcnow
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.project_member import ProjectMemberCreate, ProjectMemberUpdate
from app.services.auth import normalize_email
from app.services import notifications as notification_service
from app.services import project_access as project_access_service
from app.services import project_invitations as project_invitation_service
from app.services.notifications import NOTIF_PROJECT_INVITE, NOTIF_PROJECT_REMOVED


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
    project = get_project_or_404(session, project_id)

    # A. Programmatic Direct Addition (e.g. by user_id in tests / admin actions)
    if payload.user_id is not None:
        user = session.get(User, payload.user_id)
        if user is None:
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
        session.flush()

        # Direct notification
        inviter = session.get(User, invited_by_user_id) if invited_by_user_id else None
        notification_service.create_notification(
            session,
            user_id=user.id,
            notification_type=NOTIF_PROJECT_INVITE,
            title=f"You've been added to \"{project.name}\"",
            body=f"{inviter.display_name if inviter else 'Someone'} added you as a member.",
            project_id=project_id,
            project_name=project.name,
            actor_display_name=inviter.display_name if inviter else None,
        )

        # Update any pending invitations (same atomic commit)
        pending_invitations = session.scalars(
            select(ProjectInvitation).where(
                ProjectInvitation.project_id == project_id,
                ProjectInvitation.email == normalize_email(user.email),
                ProjectInvitation.status == "pending",
            )
        ).all()
        for pending_invitation in pending_invitations:
            pending_invitation.status = "accepted"
            pending_invitation.accepted_at = utcnow()
            session.add(pending_invitation)

        # Single atomic commit for member + notification + invitation updates
        session.commit()
        session.refresh(member)

        return {
            "result_type": "member_added",
            "member": member,
            "invitation": None,
            "message": "Project member added.",
        }

    # B. Email Invitation Flow (Always creates a pending invitation requiring Accept/Decline)
    if payload.user_email is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required to invite a user")

    # Prevent privilege escalation: "owner" role can't be assigned via invite
    if payload.role and payload.role.strip().lower() == "owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign owner role via invitation")

    normalized_email = normalize_email(payload.user_email)

    # Check if they are already a member
    user = session.scalar(select(User).where(User.email == normalized_email))
    if user is not None:
        existing_member = session.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id,
            )
        )
        if existing_member is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already exists")

    # Always create a pending ProjectInvitation
    invitation = project_invitation_service.create_or_reactivate_project_invitation(
        session,
        project_id,
        normalized_email,
        payload.role,
        invited_by_user_id,
    )

    # Send in-app notification if the user already has an active account
    if user is not None:
        inviter = session.get(User, invited_by_user_id) if invited_by_user_id else None
        notification_service.create_notification(
            session,
            user_id=user.id,
            notification_type=NOTIF_PROJECT_INVITE,
            title=f"You've been invited to \"{project.name}\"",
            body=f"{inviter.display_name if inviter else 'Someone'} invited you to join this project.",
            project_id=project_id,
            project_name=project.name,
            actor_display_name=inviter.display_name if inviter else None,
        )
        session.commit()

    return {
        "result_type": "invitation_created",
        "member": None,
        "invitation": invitation,
        "message": "Invitation sent successfully.",
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


def delete_project_member(
    session: Session,
    member: ProjectMember,
    actor_display_name: str | None = None,
) -> None:
    if _is_owner_role(member.role):
        _ensure_project_keeps_owner(session, member)

    # Fetch project name before delete
    project = session.get(Project, member.project_id)
    project_name = project.name if project else "a project"
    removed_user_id = member.user_id

    session.delete(member)
    session.flush()

    # Notify removed user
    notification_service.create_notification(
        session,
        user_id=removed_user_id,
        notification_type=NOTIF_PROJECT_REMOVED,
        title=f"You've been removed from \"{project_name}\"",
        body=f"{actor_display_name or 'A project admin'} removed you from this project.",
        project_id=member.project_id if project else None,
        project_name=project_name,
        actor_display_name=actor_display_name,
    )
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
