from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.services import activity_logs as activity_log_service
from app.schemas.ai_batch_job import AIBatchJobRead
from app.schemas.compare import (
    CompareCreate,
    CompareQueueItemRead,
    CompareQueuePageRead,
    CompareRunAIGenerateRequest,
    CompareRunAISummaryResponse,
    CompareRunRead,
)
from app.services import ai_batch_jobs as ai_batch_job_service
from app.services import ai_rate_limit
from app.services import ai_summary as ai_summary_service
from app.services import compare as compare_service
from app.services import export_docx as export_docx_service
from app.services import project_access as project_access_service
from app.services.project_events import get_event_broker, ProjectEvent, EVENT_COMPARE_STARTED


router = APIRouter(tags=["compare"], dependencies=[Depends(get_current_user)])


@router.post("/documents/{document_id}/compare-runs", status_code=status.HTTP_201_CREATED)
def create_compare_run(
    document_id: int,
    payload: CompareCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    document = project_access_service.ensure_document_access_or_404(database, document_id, current_user.id)
    compare_run = compare_service.create_compare_run(
        database,
        document_id=document_id,
        source_version_id=payload.source_version_id,
        target_version_id=payload.target_version_id,
        actor_user_id=current_user.id,
    )
    activity_log_service.record(
        database,
        project_id=document.project_id,
        user_id=current_user.id,
        action="compared",
        entity_type="compare_run",
        entity_id=compare_run["id"],
        description=f'Created compare run for "{document.title}"',
    )
    get_event_broker().publish(ProjectEvent(
        event_type=EVENT_COMPARE_STARTED,
        project_id=document.project_id,
        data={"compare_run_id": compare_run["id"], "document_title": document.title},
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
    ))
    return {"data": CompareRunRead.model_validate(compare_run).model_dump(mode="json")}


@router.get("/compare-runs/{compare_run_id}")
def get_compare_run(
    compare_run_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_compare_run_access_or_404(database, compare_run_id, current_user.id)
    compare_run = compare_service.get_compare_run_detail(database, compare_run_id)
    return {"data": CompareRunRead.model_validate(compare_run).model_dump(mode="json")}


@router.get("/compare-runs/{compare_run_id}/change-items")
def list_compare_run_change_items(
    compare_run_id: int,
    limit: int | None = Query(None, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, max_length=200),
    change_type: str | None = Query(None),
    review_status: str | None = Query(None),
    ai_status: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_compare_run_access_or_404(database, compare_run_id, current_user.id)
    has_page_query = any(
        value not in (None, "", "all")
        for value in (limit, search, change_type, review_status, ai_status)
    ) or offset > 0
    if not has_page_query:
        queue = compare_service.list_compare_run_change_items(database, compare_run_id)
        return {"data": [CompareQueueItemRead.model_validate(item).model_dump(mode="json") for item in queue]}

    page = compare_service.list_compare_run_change_items_page(
        database,
        compare_run_id,
        limit=limit or 100,
        offset=offset,
        search=search,
        change_type=change_type,
        review_status=review_status,
        ai_status=ai_status,
    )
    return {"data": CompareQueuePageRead.model_validate(page).model_dump(mode="json")}


@router.post("/compare-runs/{compare_run_id}/ai-review-drafts/generate")
def generate_compare_run_ai_review_drafts(
    request: Request,
    compare_run_id: int,
    payload: CompareRunAIGenerateRequest,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    compare_run = project_access_service.ensure_compare_run_access_or_404(database, compare_run_id, current_user.id)
    compare_service.ensure_compare_run_is_current(database, compare_run)
    ai_rate_limit.enforce_ai_batch_rate_limit(database, current_user.id)
    result = ai_batch_job_service.create_compare_run_ai_batch_job(
        database,
        compare_run_id=compare_run_id,
        actor_user_id=current_user.id,
        force_regenerate=payload.force_regenerate,
        use_rag=payload.use_rag,
        change_item_ids=payload.change_item_ids,
    )
    database.commit()
    worker = getattr(request.app.state, "ai_batch_worker", None)
    if worker is not None:
        worker.wake()
    return {"data": AIBatchJobRead.model_validate(result).model_dump(mode="json")}


@router.post("/compare-runs/{compare_run_id}/ai-summary-drafts/generate", response_model=CompareRunAISummaryResponse)
def generate_compare_run_ai_summary_draft(
    compare_run_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    compare_run = project_access_service.ensure_compare_run_access_or_404(database, compare_run_id, current_user.id)
    compare_service.ensure_compare_run_is_current(database, compare_run)
    ai_rate_limit.enforce_ai_summary_rate_limit(database, current_user.id)
    result = ai_summary_service.generate_ai_summary_draft(database, compare_run_id)
    return result


@router.get("/compare-runs/{compare_run_id}/export/docx")
def export_compare_run_docx(
    compare_run_id: int,
    summary_text: str | None = Query(None, description="Optional AI summary text to include"),
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_compare_run_access_or_404(database, compare_run_id, current_user.id)
    buffer = export_docx_service.generate_compare_run_docx(
        database, compare_run_id, summary_text=summary_text
    )
    filename = f"redline-report-CR-{compare_run_id:04d}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
