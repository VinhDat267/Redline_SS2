from fastapi import APIRouter

from app.api.routes.activity_logs import router as activity_logs_router
from app.api.routes.ai_batch_jobs import router as ai_batch_jobs_router
from app.api.routes.auth import router as auth_router
from app.api.routes.change_items import router as change_items_router
from app.api.routes.compare import router as compare_router
from app.api.routes.contracts import router as contracts_router
from app.api.routes.demo import router as demo_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.projects import router as projects_router
from app.api.routes.requirements import router as requirements_router
from app.api.routes.requirement_candidates import router as requirement_candidates_router
from app.api.routes.requirement_test_case_mappings import router as requirement_test_case_mappings_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.project_events import router as project_events_router
from app.api.routes.test_cases import router as test_cases_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(activity_logs_router, prefix="/api/v1")
api_router.include_router(ai_batch_jobs_router, prefix="/api/v1")
api_router.include_router(auth_router, prefix="/api/v1")
api_router.include_router(change_items_router, prefix="/api/v1")
api_router.include_router(compare_router, prefix="/api/v1")
api_router.include_router(contracts_router, prefix="/api/v1")
api_router.include_router(demo_router, prefix="/api/v1")
api_router.include_router(projects_router, prefix="/api/v1")
api_router.include_router(documents_router, prefix="/api/v1")
api_router.include_router(requirements_router, prefix="/api/v1")
api_router.include_router(requirement_candidates_router, prefix="/api/v1")
api_router.include_router(requirement_test_case_mappings_router, prefix="/api/v1")
api_router.include_router(test_cases_router, prefix="/api/v1")
api_router.include_router(notifications_router, prefix="/api/v1")
api_router.include_router(project_events_router, prefix="/api/v1")
