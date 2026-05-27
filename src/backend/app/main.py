from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal
from app.services.ai_batch_worker import AIBatchWorker
from app.services import upload_storage


def create_app(*, session_factory=SessionLocal, start_ai_worker: bool | None = None) -> FastAPI:
    worker_enabled = settings.ai_batch_worker_enabled if start_ai_worker is None else start_ai_worker

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        worker = None
        if worker_enabled:
            worker = AIBatchWorker(
                session_factory,
                concurrency=max(1, settings.ai_batch_concurrency),
                poll_interval_seconds=max(0.25, settings.ai_batch_poll_interval_ms / 1000),
            )
            application.state.ai_batch_worker = worker
            worker.start()
        else:
            application.state.ai_batch_worker = None

        try:
            yield
        finally:
            if worker is not None:
                worker.stop()

    application = FastAPI(title=settings.app_name, lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    application.include_router(api_router)

    if upload_storage.uses_object_storage():
        @application.get("/uploads/avatars/{avatar_path:path}", include_in_schema=False)
        def read_uploaded_avatar(avatar_path: str):
            stored_path = f"avatars/{avatar_path}"
            try:
                public_url = upload_storage.public_url_for_stored_upload(stored_path)
                if public_url is not None:
                    return RedirectResponse(public_url)
                payload = upload_storage.read_stored_upload_bytes(stored_path)
            except Exception as exc:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found") from exc
            return Response(content=payload, media_type="image/webp")
    else:
        # Serve uploaded avatars as static files
        avatars_dir = Path(settings.uploads_dir) / "avatars"
        avatars_dir.mkdir(parents=True, exist_ok=True)
        application.mount("/uploads/avatars", StaticFiles(directory=str(avatars_dir)), name="avatars")

    return application


app = create_app()
