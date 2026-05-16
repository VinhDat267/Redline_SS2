from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.requirement_candidate import (
    RequirementCandidateGenerateRequest,
    RequirementCandidateGenerationRead,
    RequirementCandidateListRead,
    RequirementCandidateRead,
    RequirementCandidateRejectRequest,
)
from app.services import project_access as project_access_service
from app.services import requirement_candidates as candidate_service


router = APIRouter(tags=["requirement-candidates"], dependencies=[Depends(get_current_user)])


@router.get("/document-versions/{version_id}/requirement-candidates")
def list_requirement_candidates(
    version_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    version = project_access_service.ensure_document_version_access_or_404(database, version_id, current_user.id)
    result = candidate_service.list_requirement_candidates(database, version)
    return {"data": RequirementCandidateListRead.model_validate(result).model_dump(mode="json")}


@router.post("/document-versions/{version_id}/requirement-candidates/generate")
def generate_requirement_candidates(
    version_id: int,
    payload: RequirementCandidateGenerateRequest,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    version = project_access_service.ensure_document_version_access_or_404(database, version_id, current_user.id)
    result = candidate_service.generate_requirement_candidates(
        database,
        version,
        force_regenerate=payload.force_regenerate,
    )
    return {"data": RequirementCandidateGenerationRead.model_validate(result).model_dump(mode="json")}


@router.post("/requirement-candidates/{candidate_id}/accept")
def accept_requirement_candidate(
    candidate_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    candidate = candidate_service.get_requirement_candidate_or_404(database, candidate_id)
    project_access_service.ensure_document_version_access_or_404(
        database,
        candidate.document_version_id,
        current_user.id,
    )
    candidate = candidate_service.accept_requirement_candidate(database, candidate)
    return {"data": RequirementCandidateRead.model_validate(candidate).model_dump(mode="json")}


@router.post("/requirement-candidates/{candidate_id}/reject")
def reject_requirement_candidate(
    candidate_id: int,
    payload: RequirementCandidateRejectRequest | None = None,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    candidate = candidate_service.get_requirement_candidate_or_404(database, candidate_id)
    project_access_service.ensure_document_version_access_or_404(
        database,
        candidate.document_version_id,
        current_user.id,
    )
    candidate = candidate_service.reject_requirement_candidate(
        database,
        candidate,
        reason=payload.reason if payload is not None else None,
    )
    return {"data": RequirementCandidateRead.model_validate(candidate).model_dump(mode="json")}
