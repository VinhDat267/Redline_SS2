from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select as sa_select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import Project, ProjectInvitation, User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.schemas.project_invitation import ProjectInvitationRead
from app.schemas.project_member import (
    ProjectMemberCreate,
    ProjectMemberCreateResultRead,
    ProjectMemberRead,
    ProjectMemberUpdate,
)
from app.services import analytics as analytics_service
from app.services import project_access as project_access_service
from app.services import project_invitations as project_invitation_service
from app.services import projects as project_service
from app.services.project_events import get_event_broker, ProjectEvent, EVENT_MEMBER_ADDED, EVENT_MEMBER_REMOVED, EVENT_INVITATION_CREATED, EVENT_INVITATION_DECLINED, EVENT_PROJECT_UPDATED, EVENT_PROJECT_DELETED


router = APIRouter(tags=["projects"], dependencies=[Depends(get_current_user)])


def _project_read_data(project: Project, document_count: int = 0) -> dict:
    data = ProjectRead.model_validate(project).model_dump(mode="json")
    data["document_count"] = document_count
    return data


@router.get("/projects")
def list_projects(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    projects = project_service.list_projects(database, current_user.id)
    project_ids = [p.id for p in projects]
    doc_counts = project_service.count_projects_documents(database, project_ids)
    return {
        "data": [
            _project_read_data(project, doc_counts.get(project.id, 0))
            for project in projects
        ]
    }


@router.post("/projects", status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project = project_service.create_project(database, payload, current_user.id)
    return {"data": _project_read_data(project)}


@router.get("/projects/{project_id}")
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project = project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    document_count = project_service.count_project_documents(database, project.id)
    return {"data": _project_read_data(project, document_count)}


@router.patch("/projects/{project_id}")
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project = project_access_service.ensure_project_admin_or_403(database, project_id, current_user.id)
    project = project_service.update_project(database, project, payload)
    document_count = project_service.count_project_documents(database, project.id)
    # Publish AFTER successful commit to avoid broadcasting stale events on DB failure
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_PROJECT_UPDATED,
        project_id=project_id,
        data={"name": project.name},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": _project_read_data(project, document_count)}


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project = project_access_service.ensure_project_admin_or_403(database, project_id, current_user.id)
    project_name = project.name  # capture before delete detaches
    project_service.delete_project(database, project)
    # Publish AFTER successful commit to avoid broadcasting stale events on DB failure
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_PROJECT_DELETED,
        project_id=project_id,
        data={"name": project_name},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/members")
def list_project_members(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    members = project_service.list_project_members(database, project_id)
    return {"data": [ProjectMemberRead.model_validate(member).model_dump(mode="json") for member in members]}


@router.post("/projects/{project_id}/members", status_code=status.HTTP_201_CREATED)
def create_project_member(
    project_id: int,
    payload: ProjectMemberCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_admin_or_403(database, project_id, current_user.id)
    result = project_service.create_project_member(database, project_id, payload, current_user.id)
    event_type = EVENT_MEMBER_ADDED if result.get("result_type") == "member_added" else EVENT_INVITATION_CREATED
    get_event_broker().publish(ProjectEvent(
        event_type=event_type,
        project_id=project_id,
        data={"email": payload.user_email, "role": payload.role},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": ProjectMemberCreateResultRead.model_validate(result).model_dump(mode="json")}


@router.patch("/projects/{project_id}/members/{member_id}")
def update_project_member(
    project_id: int,
    member_id: int,
    payload: ProjectMemberUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_admin_or_403(database, project_id, current_user.id)
    member = project_service.get_project_member_or_404(database, project_id, member_id)
    member = project_service.update_project_member(database, member, payload)
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_MEMBER_ADDED,
        project_id=project_id,
        data={"member_id": member_id, "role": member.role, "updated": True},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": ProjectMemberRead.model_validate(member).model_dump(mode="json")}


@router.delete("/projects/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_member(
    project_id: int,
    member_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_admin_or_403(database, project_id, current_user.id)
    member = project_service.get_project_member_or_404(database, project_id, member_id)
    member_email = getattr(member, "user_email", None)  # capture before delete detaches
    project_service.delete_project_member(database, member, actor_display_name=current_user.display_name)
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_MEMBER_REMOVED,
        project_id=project_id,
        data={"member_id": member_id, "email": member_email},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/invitations")
def list_project_invitations(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    invitations = project_invitation_service.list_project_invitations(database, project_id)
    return {
        "data": [
            ProjectInvitationRead.model_validate(invitation).model_dump(mode="json")
            for invitation in invitations
        ]
    }


@router.delete("/projects/{project_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_invitation(
    project_id: int,
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_admin_or_403(database, project_id, current_user.id)
    invitation = project_invitation_service.get_project_invitation_or_404(
        database,
        project_id,
        invitation_id,
    )
    invitation_email = invitation.email  # capture before mutation
    project_invitation_service.revoke_project_invitation(database, invitation)
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_INVITATION_DECLINED,
        project_id=project_id,
        data={"invitation_id": invitation_id, "email": invitation_email, "action": "revoked"},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{project_id}/invitations/{invitation_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_project_invitation(
    project_id: int,
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    """Allow the invited user themselves to decline an invitation."""
    inv = database.scalar(
        sa_select(ProjectInvitation).where(
            ProjectInvitation.id == invitation_id,
            ProjectInvitation.project_id == project_id,
            ProjectInvitation.email == current_user.email,
            ProjectInvitation.status == "pending",
        )
    )
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    inv.status = "declined"
    database.add(inv)
    database.commit()
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_INVITATION_DECLINED,
        project_id=project_id,
        data={"invitation_id": invitation_id, "email": inv.email},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/analytics")
def get_project_analytics(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    result = analytics_service.get_project_analytics(database, project_id)
    return {"data": result}
