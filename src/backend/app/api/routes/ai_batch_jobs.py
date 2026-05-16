from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.ai_batch_job import AIBatchJobItemRead, AIBatchJobRead
from app.services import ai_batch_jobs as ai_batch_job_service
from app.services import project_access as project_access_service


router = APIRouter(tags=["ai-batch-jobs"], dependencies=[Depends(get_current_user)])


@router.get("/ai-batch-jobs/{job_id}")
def get_ai_batch_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_ai_batch_job_access_or_404(database, job_id, current_user.id)
    job = ai_batch_job_service.get_ai_batch_job_detail(database, job_id)
    return {"data": AIBatchJobRead.model_validate(job).model_dump(mode="json")}


@router.get("/ai-batch-jobs/{job_id}/items")
def list_ai_batch_job_items(
    job_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_ai_batch_job_access_or_404(database, job_id, current_user.id)
    items = ai_batch_job_service.list_ai_batch_job_items(database, job_id)
    return {"data": [AIBatchJobItemRead.model_validate(item).model_dump(mode="json") for item in items]}
