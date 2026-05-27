from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.compare import (
    AISuggestedRequirementLinkCreate,
    ChangeItemDetailRead,
    ChangeItemAIGenerationResultRead,
    AIReviewDraftGenerateRequest,
    ChangeItemUpdate,
    LinkedRequirementCreate,
    ReviewCommentCreate,
    ReviewCommentRead,
    TraceabilitySuggestResponse,
)
from app.services import activity_logs as activity_log_service
from app.services import ai_rate_limit
from app.services import ai_review_drafts as ai_review_draft_service
from app.services import ai_traceability as ai_traceability_service
from app.services import change_items as change_item_service
from app.services import compare as compare_service
from app.services import project_access as project_access_service
from app.services.project_events import (
    get_event_broker, ProjectEvent,
    EVENT_CHANGE_ITEM_REVIEWED, EVENT_CHANGE_ITEM_COMMENTED,
)
from app.services import notifications as notification_service
from app.services.notifications import (
    NOTIF_CHANGE_REVIEWED,
    NOTIF_REVIEW_COMMENT,
    NOTIF_CHANGE_ASSIGNED,
    NOTIF_CHANGE_UPDATED,
)


router = APIRouter(tags=["change-items"], dependencies=[Depends(get_current_user)])


def _ensure_change_item_can_be_mutated(database: Session, change_item) -> None:
    compare_service.ensure_compare_run_is_current(database, change_item.compare_run)


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
    _ensure_change_item_can_be_mutated(database, change_item)

    # Capture state before the update
    old_assignee_id = change_item.assignee_user_id
    old_review_status = change_item.review_status
    old_summary = change_item.summary

    detail = change_item_service.update_change_item(
        database,
        change_item_id=change_item_id,
        updates=payload.model_dump(exclude_unset=True),
    )

    project_id = change_item.compare_run.source_version.document.project_id
    project_name = change_item.compare_run.source_version.document.project.name
    section_title = change_item.section_title or "Change Item"
    updates_dict = payload.model_dump(exclude_unset=True)

    # 1. Handle Assignee Updates
    if "assignee_user_id" in updates_dict:
        new_assignee_id = payload.assignee_user_id
        if new_assignee_id != old_assignee_id:
            # Record activity log
            activity_log_service.record(
                database,
                project_id=project_id,
                user_id=current_user.id,
                action="assigned",
                entity_type="change_item",
                entity_id=change_item_id,
                description=f"Assigned change item \"{section_title}\" to user ID {new_assignee_id}",
            )

            # Notify the new assignee directly (if it's not the actor)
            if new_assignee_id is not None and new_assignee_id != current_user.id:
                notification_service.create_notification(
                    database,
                    user_id=new_assignee_id,
                    notification_type=NOTIF_CHANGE_ASSIGNED,
                    title=f"You've been assigned \"{section_title}\"",
                    body=f"{current_user.display_name} assigned you to review a change item in \"{project_name}\".",
                    project_id=project_id,
                    project_name=project_name,
                    actor_display_name=current_user.display_name,
                )

            # Notify previous assignee of unassignment (if it wasn't the actor)
            if old_assignee_id is not None and old_assignee_id != current_user.id and old_assignee_id != new_assignee_id:
                notification_service.create_notification(
                    database,
                    user_id=old_assignee_id,
                    notification_type=NOTIF_CHANGE_ASSIGNED,
                    title=f"Unassigned from \"{section_title}\"",
                    body=f"{current_user.display_name} unassigned you from this change item in \"{project_name}\".",
                    project_id=project_id,
                    project_name=project_name,
                    actor_display_name=current_user.display_name,
                )

            # Publish SSE event for live dashboard update
            get_event_broker().publish(ProjectEvent(
                event_type=EVENT_CHANGE_ITEM_REVIEWED, # reuse reviewed event type to refresh activity
                project_id=project_id,
                data={"change_item_id": change_item_id, "assignee_user_id": new_assignee_id},
                actor_user_id=current_user.id,
                actor_display_name=current_user.display_name,
            ))

    # 2. Handle Review Status Updates
    if "review_status" in updates_dict and payload.review_status != old_review_status:
        activity_log_service.record(
            database,
            project_id=project_id,
            user_id=current_user.id,
            action="reviewed",
            entity_type="change_item",
            entity_id=change_item_id,
            description=f'Updated review status of "{section_title}" to "{payload.review_status}"',
        )
        get_event_broker().publish(ProjectEvent(
            event_type=EVENT_CHANGE_ITEM_REVIEWED,
            project_id=project_id,
            data={"change_item_id": change_item_id, "review_status": payload.review_status},
            actor_user_id=current_user.id,
            actor_display_name=current_user.display_name,
        ))

        # Notify the assignee directly with a personalised message
        assignee_id = change_item.assignee_user_id
        if assignee_id is not None and assignee_id != current_user.id:
            notification_service.create_notification(
                database,
                user_id=assignee_id,
                notification_type=NOTIF_CHANGE_REVIEWED,
                title=f"Review status updated for \"{section_title}\"",
                body=f"{current_user.display_name} set the review status to \"{payload.review_status}\" in \"{project_name}\".",
                project_id=project_id,
                project_name=project_name,
                actor_display_name=current_user.display_name,
            )

        # Notify remaining project members (exclude assignee who was notified above)
        notification_service.notify_project_members(
            database, project_id, current_user.id,
            notification_type=NOTIF_CHANGE_REVIEWED,
            title=f'Change item review status updated',
            body=f"{current_user.display_name} updated the status of \"{section_title}\" to \"{payload.review_status}\".",
            actor_display_name=current_user.display_name,
            exclude_user_ids=[assignee_id] if assignee_id is not None else None,
        )

    # 3. Handle Summary/Details Modification
    elif "summary" in updates_dict and payload.summary != old_summary:
        # Notify the assignee directly (if someone is assigned and it's not the actor)
        assignee_id = change_item.assignee_user_id
        if assignee_id is not None and assignee_id != current_user.id:
            notification_service.create_notification(
                database,
                user_id=assignee_id,
                notification_type=NOTIF_CHANGE_UPDATED,
                title=f"Details updated for \"{section_title}\"",
                body=f"{current_user.display_name} updated the summary/notes in \"{project_name}\".",
                project_id=project_id,
                project_name=project_name,
                actor_display_name=current_user.display_name,
            )

    database.commit()
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}


@router.post("/change-items/{change_item_id}/comments", status_code=status.HTTP_201_CREATED)
def create_review_comment(
    change_item_id: int,
    payload: ReviewCommentCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    change_item = project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    _ensure_change_item_can_be_mutated(database, change_item)
    comment = change_item_service.create_review_comment(
        database,
        change_item_id=change_item_id,
        author_user_id=current_user.id,
        content=payload.content,
    )
    project_id = change_item.compare_run.source_version.document.project_id
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_CHANGE_ITEM_COMMENTED,
        project_id=project_id,
        data={"change_item_id": change_item_id},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    notification_service.notify_project_members(
        database, project_id, current_user.id,
        notification_type=NOTIF_REVIEW_COMMENT,
        title="New review comment",
        body=f"{current_user.display_name} commented on a change item.",
        actor_display_name=current_user.display_name,
    )
    database.commit()
    return {"data": ReviewCommentRead.model_validate(comment).model_dump(mode="json")}


@router.post("/change-items/{change_item_id}/ai-review-draft/generate")
def generate_change_item_ai_review_draft(
    change_item_id: int,
    payload: AIReviewDraftGenerateRequest,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    change_item = project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    _ensure_change_item_can_be_mutated(database, change_item)
    ai_rate_limit.enforce_ai_review_draft_rate_limit(database, current_user.id)
    result = ai_review_draft_service.generate_change_item_ai_draft(
        database,
        change_item_id=change_item_id,
        actor_user_id=current_user.id,
        force_regenerate=payload.force_regenerate,
        use_rag=payload.use_rag,
    )
    return {"data": ChangeItemAIGenerationResultRead.model_validate(result).model_dump(mode="json")}


@router.post("/change-items/{change_item_id}/suggest-links")
def suggest_traceability_links(
    change_item_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    change_item = project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    _ensure_change_item_can_be_mutated(database, change_item)
    ai_rate_limit.enforce_ai_traceability_suggest_rate_limit(database, current_user.id)
    result = ai_traceability_service.suggest_traceability_links(database, change_item_id)
    return {"data": TraceabilitySuggestResponse.model_validate(result).model_dump(mode="json")}


@router.post("/change-items/{change_item_id}/requirement-links/ai-suggested", status_code=status.HTTP_201_CREATED)
def accept_ai_suggested_requirement_link(
    change_item_id: int,
    payload: AISuggestedRequirementLinkCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    change_item = project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    _ensure_change_item_can_be_mutated(database, change_item)
    ai_traceability_service.verify_suggestion_token(
        database,
        change_item_id=change_item_id,
        requirement_id=payload.requirement_id,
        suggestion_token=payload.suggestion_token,
    )
    detail = change_item_service.create_requirement_link(
        database,
        change_item_id=change_item_id,
        requirement_id=payload.requirement_id,
        notes=payload.notes,
        link_type="ai_suggested",
    )
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}


@router.post("/change-items/{change_item_id}/requirement-links", status_code=status.HTTP_201_CREATED)
def create_requirement_link(
    change_item_id: int,
    payload: LinkedRequirementCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    change_item = project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    _ensure_change_item_can_be_mutated(database, change_item)
    detail = change_item_service.create_requirement_link(
        database,
        change_item_id=change_item_id,
        requirement_id=payload.requirement_id,
        notes=payload.notes,
        link_type="manual",
    )
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}

@router.delete("/change-items/{change_item_id}/requirement-links/{requirement_id}")
def delete_requirement_link(
    change_item_id: int,
    requirement_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    change_item = project_access_service.ensure_change_item_access_or_404(database, change_item_id, current_user.id)
    _ensure_change_item_can_be_mutated(database, change_item)
    detail = change_item_service.delete_requirement_link(
        database,
        change_item_id=change_item_id,
        requirement_id=requirement_id,
    )
    return {"data": ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")}
