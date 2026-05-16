from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.services import activity_logs as activity_log_service
from app.services import project_access as project_access_service


router = APIRouter(tags=["activity-logs"], dependencies=[Depends(get_current_user)])


@router.get("/projects/{project_id}/activity-logs")
def list_project_activity_logs(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    logs = activity_log_service.list_activity_logs(database, project_id)
    return {"data": logs}
