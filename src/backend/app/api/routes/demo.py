from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.project import ProjectRead
from app.services import demo as demo_service


router = APIRouter(tags=["demo"])


@router.post("/demo/seed")
def seed_demo_workspace(
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    payload = demo_service.seed_demo_workspace(database, current_user)
    return {
        "data": {
            "project": ProjectRead.model_validate(payload["project"]).model_dump(mode="json"),
            "documents_seeded": payload["documents_seeded"],
            "versions_seeded": payload["versions_seeded"],
        }
    }
