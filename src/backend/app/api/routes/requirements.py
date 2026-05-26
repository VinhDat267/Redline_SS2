from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.requirement import RequirementCreate, RequirementRead, RequirementUpdate
from app.services import project_access as project_access_service
from app.services import requirements as requirement_service
from app.services.project_events import (
    get_event_broker, ProjectEvent,
    EVENT_REQUIREMENT_CREATED, EVENT_REQUIREMENT_UPDATED, EVENT_REQUIREMENT_DELETED,
)


router = APIRouter(tags=["requirements"], dependencies=[Depends(get_current_user)])


@router.get("/projects/{project_id}/requirements")
def list_requirements(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    requirements = requirement_service.list_requirements(database, project_id)
    return {
        "data": [RequirementRead.model_validate(requirement).model_dump(mode="json") for requirement in requirements]
    }


@router.post("/projects/{project_id}/requirements", status_code=status.HTTP_201_CREATED)
def create_requirement(
    project_id: int,
    payload: RequirementCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    requirement = requirement_service.create_requirement(database, project_id, payload)
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_REQUIREMENT_CREATED,
        project_id=project_id,
        data={"requirement_code": requirement.requirement_code, "title": requirement.title},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": RequirementRead.model_validate(requirement).model_dump(mode="json")}


@router.get("/requirements/{requirement_id}")
def get_requirement(
    requirement_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    requirement = project_access_service.ensure_requirement_access_or_404(database, requirement_id, current_user.id)
    return {"data": RequirementRead.model_validate(requirement).model_dump(mode="json")}


@router.patch("/requirements/{requirement_id}")
def update_requirement(
    requirement_id: int,
    payload: RequirementUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    requirement = project_access_service.ensure_requirement_access_or_404(database, requirement_id, current_user.id)
    requirement = requirement_service.update_requirement(database, requirement, payload)
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_REQUIREMENT_UPDATED,
        project_id=requirement.document.project_id,
        data={"requirement_code": requirement.requirement_code, "title": requirement.title},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": RequirementRead.model_validate(requirement).model_dump(mode="json")}


@router.delete("/requirements/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_requirement(
    requirement_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    requirement = project_access_service.ensure_requirement_access_or_404(database, requirement_id, current_user.id)
    project_id = requirement.document.project_id
    req_code = requirement.requirement_code
    requirement_service.delete_requirement(database, requirement)
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_REQUIREMENT_DELETED,
        project_id=project_id,
        data={"requirement_code": req_code},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return Response(status_code=status.HTTP_204_NO_CONTENT)

