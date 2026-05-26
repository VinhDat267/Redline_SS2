from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.document import DocumentCreate, DocumentRead, DocumentUpdate
from app.schemas.document_version import DocumentVersionRead, DocumentVersionUpdate
from app.schemas.parser_workspace import ParserSurfaceDetailRead, ParserWorkspaceRead
from app.services import activity_logs as activity_log_service
from app.services import documents as document_service
from app.services.document_parser import DocumentParseError
from app.services import parser_workspace as parser_workspace_service
from app.services import project_access as project_access_service
from app.services.project_events import get_event_broker, ProjectEvent, EVENT_DOCUMENT_CREATED, EVENT_DOCUMENT_DELETED, EVENT_VERSION_CREATED


router = APIRouter(tags=["documents"], dependencies=[Depends(get_current_user)])


@router.get("/projects/{project_id}/documents")
def list_documents(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    documents = document_service.list_documents(database, project_id)
    return {"data": [DocumentRead.model_validate(document).model_dump(mode="json") for document in documents]}


@router.post("/projects/{project_id}/documents", status_code=status.HTTP_201_CREATED)
def create_document(
    project_id: int,
    payload: DocumentCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    document = document_service.create_document(database, project_id, payload)
    activity_log_service.record(
        database,
        project_id=project_id,
        user_id=current_user.id,
        action="created",
        entity_type="document",
        entity_id=document.id,
        description=f'Created document "{document.title}"',
    )
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_DOCUMENT_CREATED,
        project_id=project_id,
        data={"document_id": document.id, "title": document.title},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": DocumentRead.model_validate(document).model_dump(mode="json")}


@router.get("/documents/{document_id}")
def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    document = project_access_service.ensure_document_access_or_404(database, document_id, current_user.id)
    return {"data": DocumentRead.model_validate(document).model_dump(mode="json")}


@router.get("/documents/{document_id}/parser-workspace")
def get_parser_workspace(
    document_id: int,
    version_id: int | None = None,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_document_access_or_404(database, document_id, current_user.id)
    workspace = parser_workspace_service.get_parser_workspace(database, document_id, version_id)
    return {"data": ParserWorkspaceRead.model_validate(workspace).model_dump(mode="json", exclude_none=True)}


@router.patch("/documents/{document_id}")
def update_document(
    document_id: int,
    payload: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    document = project_access_service.ensure_document_access_or_404(database, document_id, current_user.id)
    document = document_service.update_document(database, document, payload)
    return {"data": DocumentRead.model_validate(document).model_dump(mode="json")}


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    document = project_access_service.ensure_document_access_or_404(database, document_id, current_user.id)
    project_id = document.project_id
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_DOCUMENT_DELETED,
        project_id=project_id,
        data={"document_id": document.id, "title": document.title},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    document_service.delete_document(database, document)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/documents/{document_id}/versions")
def list_document_versions(
    document_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_document_access_or_404(database, document_id, current_user.id)
    versions = document_service.list_document_versions(database, document_id)
    return {
        "data": [DocumentVersionRead.model_validate(version).model_dump(mode="json") for version in versions]
    }


@router.post("/documents/{document_id}/versions", status_code=status.HTTP_201_CREATED)
def create_document_version(
    document_id: int,
    version_label: str = Form(...),
    notes: str | None = Form(default=None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    document = project_access_service.ensure_document_access_or_404(database, document_id, current_user.id)
    version = document_service.create_document_version(
        database,
        document_id=document_id,
        version_label=version_label,
        notes=notes,
        actor_user_id=current_user.id,
        upload_file=file,
    )
    activity_log_service.record(
        database,
        project_id=document.project_id,
        user_id=current_user.id,
        action="uploaded",
        entity_type="version",
        entity_id=version.id,
        description=f'Uploaded version "{version_label}" to "{document.title}"',
    )
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_VERSION_CREATED,
        project_id=document.project_id,
        data={"document_id": document.id, "version_id": version.id, "version_label": version_label, "document_title": document.title},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": DocumentVersionRead.model_validate(version).model_dump(mode="json")}


@router.get("/document-versions/{version_id}")
def get_document_version(
    version_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    version = project_access_service.ensure_document_version_access_or_404(database, version_id, current_user.id)
    return {"data": DocumentVersionRead.model_validate(version).model_dump(mode="json")}


@router.get("/document-versions/{version_id}/parser-surfaces/{surface_id}")
def get_parser_surface_detail(
    version_id: int,
    surface_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_document_version_access_or_404(database, version_id, current_user.id)
    detail = parser_workspace_service.get_parser_surface_detail(database, version_id, surface_id)
    ParserSurfaceDetailRead.model_validate(detail)
    return {"data": detail}


@router.patch("/document-versions/{version_id}")
def update_document_version(
    version_id: int,
    payload: DocumentVersionUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    version = project_access_service.ensure_document_version_access_or_404(database, version_id, current_user.id)
    version = document_service.update_document_version(database, version, payload)
    return {"data": DocumentVersionRead.model_validate(version).model_dump(mode="json")}


@router.delete("/document-versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_version(
    version_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    version = project_access_service.ensure_document_version_access_or_404(database, version_id, current_user.id)
    document_service.delete_document_version(database, version)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/document-versions/{version_id}/parse")
def parse_document_version(
    version_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    version = project_access_service.ensure_document_version_access_or_404(database, version_id, current_user.id)
    try:
        version = document_service.parse_document_version(database, version)
    except DocumentParseError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    activity_log_service.record(
        database,
        project_id=version.document.project_id,
        user_id=current_user.id,
        action="parsed",
        entity_type="version",
        entity_id=version.id,
        description=f'Parsed version "{version.version_label}"',
    )
    return {"data": DocumentVersionRead.model_validate(version).model_dump(mode="json")}
