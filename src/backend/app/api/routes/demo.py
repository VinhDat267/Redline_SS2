from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.project import ProjectRead
from app.services import demo as demo_service
from app.services import projects as project_service


router = APIRouter(tags=["demo"])


@router.post("/demo/seed")
def seed_demo_workspace(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    payload = demo_service.seed_demo_workspace(database, current_user)
    project_data = ProjectRead.model_validate(payload["project"]).model_dump(mode="json")
    project_data["document_count"] = project_service.count_project_documents(database, payload["project"].id)
    return {
        "data": {
            "project": project_data,
            "documents_seeded": payload["documents_seeded"],
            "versions_seeded": payload["versions_seeded"],
        }
    }
