from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProjectInvitation, ProjectMember
from app.models.mixins import utcnow


def normalize_email(email: str) -> str:
    return email.strip().lower()


def list_project_invitations(session: Session, project_id: int) -> list[ProjectInvitation]:
    return list(
        session.scalars(
            select(ProjectInvitation)
            .where(
                ProjectInvitation.project_id == project_id,
                ProjectInvitation.status == "pending",
            )
            .order_by(ProjectInvitation.id)
        )
    )


def get_project_invitation_or_404(
    session: Session,
    project_id: int,
    invitation_id: int,
) -> ProjectInvitation:
    invitation = session.get(ProjectInvitation, invitation_id)
    if invitation is None or invitation.project_id != project_id or invitation.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project invitation not found")
    return invitation


def get_project_invitation_by_email(
    session: Session,
    project_id: int,
    email: str,
) -> ProjectInvitation | None:
    return session.scalar(
        select(ProjectInvitation).where(
            ProjectInvitation.project_id == project_id,
            ProjectInvitation.email == normalize_email(email),
        )
    )


def create_or_reactivate_project_invitation(
    session: Session,
    project_id: int,
    email: str,
    role: str | None,
    invited_by_user_id: int | None,
) -> ProjectInvitation:
    normalized_email = normalize_email(email)
    existing_invitation = get_project_invitation_by_email(session, project_id, normalized_email)

    if existing_invitation is not None and existing_invitation.status == "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pending invitation already exists")

    if existing_invitation is None:
        invitation = ProjectInvitation(
            project_id=project_id,
            email=normalized_email,
            role=role,
            status="pending",
            invited_by_user_id=invited_by_user_id,
            accepted_at=None,
        )
    else:
        invitation = existing_invitation
        invitation.role = role
        invitation.status = "pending"
        invitation.invited_by_user_id = invited_by_user_id
        invitation.accepted_at = None

    session.add(invitation)
    session.commit()
    session.refresh(invitation)
    return invitation


def revoke_project_invitation(session: Session, invitation: ProjectInvitation) -> None:
    invitation.status = "revoked"
    session.add(invitation)
    session.commit()


def list_pending_invitations_for_email(session: Session, email: str) -> list[ProjectInvitation]:
    normalized_email = normalize_email(email)
    return list(
        session.scalars(
            select(ProjectInvitation)
            .where(
                ProjectInvitation.email == normalized_email,
                ProjectInvitation.status == "pending",
            )
            .order_by(ProjectInvitation.id)
        )
    )


def accept_project_invitation(
    session: Session,
    invitation: ProjectInvitation,
    user_id: int,
) -> ProjectMember:
    existing_member = session.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == invitation.project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if existing_member is not None:
        invitation.status = "accepted"
        invitation.accepted_at = invitation.accepted_at or utcnow()
        session.add(invitation)
        session.commit()
        session.refresh(existing_member)
        return existing_member

    member = ProjectMember(
        project_id=invitation.project_id,
        user_id=user_id,
        role=invitation.role,
    )
    session.add(member)
    invitation.status = "accepted"
    invitation.accepted_at = utcnow()
    session.add(invitation)
    session.commit()
    session.refresh(member)
    return member
