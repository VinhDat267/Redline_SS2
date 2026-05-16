from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.compare import (
    ChangeItemDetailRead,
    ChangeItemAIGenerationResultRead,
    AIReviewDraftGenerateRequest,
    ChangeItemUpdate,
    ReviewCommentCreate,
    ReviewCommentRead,
)
from app.services import activity_logs as activity_log_service
from app.services import ai_rate_limit
from app.services import ai_review_drafts as ai_review_draft_service
from app.services import change_items as change_item_service
from app.services import project_access as project_access_service


router = APIRouter(tags=["change-items"], dependencies=[Depends(get_current_user)])


@router.get("/change-items/{change_item_id}")
def get_change_item_detail(
    change_item_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    detail = change_item_service.get_change_item_detail(database, change_item_id)
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}


@router.patch("/change-items/{change_item_id}")
def update_change_item(
    change_item_id: int,
    payload: ChangeItemUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    change_item = project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    detail = change_item_service.update_change_item(
        database,
        change_item_id=change_item_id,
        updates=payload.model_dump(exclude_unset=True),
    )
    if payload.review_status is not None:
        project_id = change_item.compare_run.source_version.document.project_id
        activity_log_service.record(
            database,
            project_id=project_id,
            user_id=current_user.id,
            action="reviewed",
            entity_type="change_item",
            entity_id=change_item_id,
            description=f'Updated review status to "{payload.review_status}"',
        )
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}


@router.post("/change-items/{change_item_id}/comments", status_code=status.HTTP_201_CREATED)
def create_review_comment(
    change_item_id: int,
    payload: ReviewCommentCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    comment = change_item_service.create_review_comment(
        database,
        change_item_id=change_item_id,
        author_user_id=current_user.id,
        content=payload.content,
    )
    return {"data": ReviewCommentRead.model_validate(comment).model_dump(mode="json")}


@router.post("/change-items/{change_item_id}/ai-review-draft/generate")
def generate_change_item_ai_review_draft(
    change_item_id: int,
    payload: AIReviewDraftGenerateRequest,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    ai_rate_limit.enforce_ai_review_draft_rate_limit(database, current_user.id)
    result = ai_review_draft_service.generate_change_item_ai_draft(
        database,
        change_item_id=change_item_id,
        actor_user_id=current_user.id,
        force_regenerate=payload.force_regenerate,
        use_rag=payload.use_rag,
    )
    return {"data": ChangeItemAIGenerationResultRead.model_validate(result).model_dump(mode="json")}

from app.schemas.compare import LinkedRequirementCreate

@router.post("/change-items/{change_item_id}/requirement-links", status_code=status.HTTP_201_CREATED)
def create_requirement_link(
    change_item_id: int,
    payload: LinkedRequirementCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    detail = change_item_service.create_requirement_link(
        database,
        change_item_id=change_item_id,
        requirement_id=payload.requirement_id,
        notes=payload.notes,
    )
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}

@router.delete("/change-items/{change_item_id}/requirement-links/{requirement_id}")
def delete_requirement_link(
    change_item_id: int,
    requirement_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    detail = change_item_service.delete_requirement_link(
        database,
        change_item_id=change_item_id,
        requirement_id=requirement_id,
    )
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}
