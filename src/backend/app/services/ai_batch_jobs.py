from __future__ import annotations

import time
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models import AIBatchJob, AIBatchJobItem, ChangeItem, CompareRun
from app.models.mixins import utcnow
from app.services import compare as compare_service
from app.services import ai_review_drafts
from app.services.llm_adapter import LLMAdapter


ACTIVE_JOB_STATUSES = {"queued", "running"}
TERMINAL_ITEM_STATUSES = {"generated", "failed", "skipped"}


def get_llm_adapter() -> LLMAdapter:
    return ai_review_drafts.get_llm_adapter()


def create_compare_run_ai_batch_job(
    session: Session,
    *,
    compare_run_id: int,
    actor_user_id: int | None,
    force_regenerate: bool,
    use_rag: bool = True,
    change_item_ids: list[int] | None = None,
) -> dict[str, object]:
    compare_run = session.get(CompareRun, compare_run_id)
    if compare_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")
    compare_service.ensure_compare_run_is_current(session, compare_run)

    existing_job = session.scalar(
        select(AIBatchJob)
        .where(AIBatchJob.compare_run_id == compare_run_id, AIBatchJob.status.in_(ACTIVE_JOB_STATUSES))
        .order_by(AIBatchJob.id.desc())
    )
    if existing_job is not None:
        return _serialize_job(existing_job, active=True)

    selected_change_items = _load_selected_change_items(session, compare_run_id, change_item_ids)
    if not selected_change_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Compare run does not contain change items for AI generation",
        )

    job = AIBatchJob(
        compare_run_id=compare_run_id,
        job_type="generate_ai_review_drafts",
        status="queued",
        requested_count=len(selected_change_items),
        processed_count=0,
        generated_count=0,
        failed_count=0,
        force_regenerate=force_regenerate,
        use_rag=use_rag,
        requested_by_user_id=actor_user_id,
    )
    session.add(job)
    session.flush()

    for change_item in selected_change_items:
        session.add(
            AIBatchJobItem(
                job_id=job.id,
                change_item_id=change_item.id,
                status="queued",
                attempt_count=0,
            )
        )

    session.flush()
    return _serialize_job(job, active=True)


def get_ai_batch_job_detail(session: Session, job_id: int) -> dict[str, object]:
    job = session.get(AIBatchJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI batch job not found")
    return _serialize_job(job, active=job.status in ACTIVE_JOB_STATUSES)


def list_ai_batch_job_items(session: Session, job_id: int) -> list[dict[str, object]]:
    job = session.get(AIBatchJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI batch job not found")

    items = list(
        session.scalars(
            select(AIBatchJobItem)
            .where(AIBatchJobItem.job_id == job_id)
            .order_by(AIBatchJobItem.id)
        )
    )
    return [
        {
            "job_item_id": item.id,
            "change_item_id": item.change_item_id,
            "status": item.status,
            "provider_used": item.provider_used,
            "fallback_used": item.fallback_used,
            "error_message": item.error_message,
            "attempt_count": item.attempt_count,
            "started_at": item.started_at,
            "completed_at": item.completed_at,
        }
        for item in items
    ]


def get_active_ai_batch_job_summary(session: Session, compare_run_id: int) -> dict[str, object] | None:
    job = session.scalar(
        select(AIBatchJob)
        .where(AIBatchJob.compare_run_id == compare_run_id, AIBatchJob.status.in_(ACTIVE_JOB_STATUSES))
        .order_by(AIBatchJob.id.desc())
    )
    if job is None:
        return None
    return _serialize_job(job, active=True)


def get_latest_ai_batch_job_summary(session: Session, compare_run_id: int) -> dict[str, object] | None:
    job = session.scalar(
        select(AIBatchJob)
        .where(AIBatchJob.compare_run_id == compare_run_id)
        .order_by(AIBatchJob.id.desc())
    )
    if job is None:
        return None
    return _serialize_job(job, active=job.status in ACTIVE_JOB_STATUSES)


def process_next_ai_batch_job(
    session_factory: sessionmaker,
    *,
    concurrency: int | None = None,
) -> bool:
    _ = concurrency  # Reserved for a future bounded-concurrency worker step.

    with session_factory() as session:
        requeue_stale_ai_batch_jobs(
            session,
            item_stale_after=timedelta(seconds=settings.ai_batch_stale_item_seconds),
            job_stale_after=timedelta(seconds=settings.ai_batch_stale_job_seconds),
        )
        job = session.scalar(
            select(AIBatchJob)
            .where(AIBatchJob.status == "queued")
            .order_by(AIBatchJob.id)
        )
        if job is None:
            session.commit()
            return False

        now = utcnow()
        job.status = "running"
        job.started_at = job.started_at or now
        job.last_heartbeat_at = now
        session.add(job)
        job_id = job.id
        session.commit()

    adapter = get_llm_adapter()

    with session_factory() as session:
        job = session.get(AIBatchJob, job_id)
        if job is None:
            return False
        item_ids = list(
            session.scalars(
                select(AIBatchJobItem.id)
                .where(AIBatchJobItem.job_id == job_id)
                .order_by(AIBatchJobItem.id)
            )
        )

    try:
        item_batches = list(_chunked(item_ids, settings.ai_review_batch_size))
        for batch_index, item_batch in enumerate(item_batches):
            if batch_index > 0:
                time.sleep(settings.ai_batch_inter_item_delay)
            _process_batch_job_items(session_factory, item_batch, adapter=adapter)
    except Exception as exc:
        with session_factory() as session:
            job = session.get(AIBatchJob, job_id)
            if job is not None:
                job.status = "failed"
                job.error_message = str(exc)
                job.completed_at = utcnow()
                job.last_heartbeat_at = utcnow()
                session.add(job)
                session.commit()
        raise

    return True


def requeue_stale_ai_batch_jobs(
    session: Session,
    *,
    item_stale_after: timedelta,
    job_stale_after: timedelta,
) -> int:
    now = utcnow()
    stale_item_cutoff = now - item_stale_after
    stale_job_cutoff = now - job_stale_after

    stale_jobs = list(
        session.scalars(
            select(AIBatchJob)
            .where(AIBatchJob.status == "running")
            .where(
                (AIBatchJob.last_heartbeat_at.is_(None)) | (AIBatchJob.last_heartbeat_at < stale_job_cutoff)
            )
        )
    )

    if not stale_jobs:
        return 0

    stale_job_ids = [job.id for job in stale_jobs]
    stale_items = list(
        session.scalars(
            select(AIBatchJobItem)
            .where(AIBatchJobItem.job_id.in_(stale_job_ids))
            .where(AIBatchJobItem.status == "running")
            .where(
                (AIBatchJobItem.last_heartbeat_at.is_(None))
                | (AIBatchJobItem.last_heartbeat_at < stale_item_cutoff)
            )
        )
    )

    for item in stale_items:
        item.status = "queued"
        item.started_at = None
        item.completed_at = None
        item.last_heartbeat_at = None
        session.add(item)

    for job in stale_jobs:
        job.status = "queued"
        job.started_at = None
        job.completed_at = None
        job.last_heartbeat_at = None
        session.add(job)

    return len(stale_jobs)


def _chunked(item_ids: list[int], batch_size: int) -> list[list[int]]:
    safe_batch_size = max(int(batch_size or 1), 1)
    return [
        item_ids[start_index : start_index + safe_batch_size]
        for start_index in range(0, len(item_ids), safe_batch_size)
    ]


def _load_selected_change_items(
    session: Session,
    compare_run_id: int,
    change_item_ids: list[int] | None,
) -> list[ChangeItem]:
    statement = select(ChangeItem).where(ChangeItem.compare_run_id == compare_run_id).order_by(ChangeItem.id)
    if change_item_ids:
        unique_ids = sorted(set(change_item_ids))
        statement = statement.where(ChangeItem.id.in_(unique_ids))
    change_items = list(session.scalars(statement))
    if not change_items and change_item_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change items not found for compare run")
    if change_item_ids and len(change_items) != len(set(change_item_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change items not found for compare run")
    return change_items


def _process_batch_job_items(
    session_factory: sessionmaker,
    job_item_ids: list[int],
    *,
    adapter: LLMAdapter,
) -> None:
    if not job_item_ids:
        return

    with session_factory() as session:
        job_items = _load_active_job_items(session, job_item_ids)
        if not job_items:
            return

        now = utcnow()
        for job_item in job_items:
            job_item.status = "running"
            job_item.attempt_count += 1
            job_item.started_at = job_item.started_at or now
            job_item.last_heartbeat_at = now
            session.add(job_item)

        job = session.get(AIBatchJob, job_items[0].job_id)
        if job is None:
            session.commit()
            return

        job.last_heartbeat_at = now
        session.add(job)
        job_context = {
            "job_id": job.id,
            "requested_by_user_id": job.requested_by_user_id,
            "force_regenerate": job.force_regenerate,
            "use_rag": job.use_rag,
        }
        change_item_ids = [job_item.change_item_id for job_item in job_items]
        session.commit()

    try:
        item_results = _generate_batch_item_results(
            session_factory,
            change_item_ids,
            actor_user_id=job_context["requested_by_user_id"],
            force_regenerate=bool(job_context["force_regenerate"]),
            use_rag=bool(job_context["use_rag"]),
            adapter=adapter,
        )
    except Exception as exc:
        item_results = {
            change_item_id: {
                "status": "failed",
                "provider_used": None,
                "fallback_used": False,
                "error_message": str(exc),
            }
            for change_item_id in change_item_ids
        }

    with session_factory() as session:
        job_items = _load_job_items(session, job_item_ids)
        now = utcnow()
        for job_item in job_items:
            result = item_results.get(
                job_item.change_item_id,
                {
                    "status": "failed",
                    "provider_used": None,
                    "fallback_used": False,
                    "error_message": "AI batch item did not return a result.",
                },
            )
            job_item.status = str(result["status"])
            job_item.provider_used = result["provider_used"]
            job_item.fallback_used = bool(result["fallback_used"])
            job_item.error_message = result["error_message"]
            job_item.completed_at = now
            job_item.last_heartbeat_at = now
            session.add(job_item)

        job = session.get(AIBatchJob, job_context["job_id"])
        if job is not None:
            _refresh_job_progress(session, job)
            job.last_heartbeat_at = now
            if job.processed_count >= job.requested_count:
                job.completed_at = now
                job.status = "completed_with_failures" if job.failed_count > 0 else "completed"
            else:
                job.status = "running"
            session.add(job)

        session.commit()


def _load_active_job_items(session: Session, job_item_ids: list[int]) -> list[AIBatchJobItem]:
    return [
        item
        for item in _load_job_items(session, job_item_ids)
        if item.status not in TERMINAL_ITEM_STATUSES
    ]


def _load_job_items(session: Session, job_item_ids: list[int]) -> list[AIBatchJobItem]:
    return list(
        session.scalars(
            select(AIBatchJobItem)
            .where(AIBatchJobItem.id.in_(job_item_ids))
            .order_by(AIBatchJobItem.id)
        )
    )


def _generate_batch_item_results(
    session_factory: sessionmaker,
    change_item_ids: list[int],
    *,
    actor_user_id: int | None,
    force_regenerate: bool,
    use_rag: bool,
    adapter: LLMAdapter,
) -> dict[int, dict[str, object]]:
    with session_factory() as session:
        draft_results = ai_review_drafts.generate_change_item_ai_draft_records_batch(
            session,
            change_item_ids=change_item_ids,
            actor_user_id=actor_user_id,
            force_regenerate=force_regenerate,
            use_rag=use_rag,
            adapter=adapter,
        )

        item_results: dict[int, dict[str, object]] = {}
        for change_item_id, draft, skipped in draft_results:
            item_results[change_item_id] = {
                "status": "skipped" if skipped else draft.generation_status,
                "provider_used": draft.provider_used,
                "fallback_used": draft.fallback_used,
                "error_message": draft.error_message,
            }
        session.commit()
        return item_results


def _process_batch_job_item(
    session_factory: sessionmaker,
    job_item_id: int,
    *,
    adapter: LLMAdapter,
) -> None:
    _process_batch_job_items(session_factory, [job_item_id], adapter=adapter)


def _refresh_job_progress(session: Session, job: AIBatchJob) -> None:
    items = list(session.scalars(select(AIBatchJobItem).where(AIBatchJobItem.job_id == job.id)))
    job.processed_count = sum(1 for item in items if item.status in TERMINAL_ITEM_STATUSES)
    job.generated_count = sum(1 for item in items if item.status == "generated")
    job.failed_count = sum(1 for item in items if item.status == "failed")


def _serialize_job(job: AIBatchJob, *, active: bool) -> dict[str, object]:
    return {
        "job_id": job.id,
        "compare_run_id": job.compare_run_id,
        "status": job.status,
        "requested_count": job.requested_count,
        "processed_count": job.processed_count,
        "generated_count": job.generated_count,
        "failed_count": job.failed_count,
        "force_regenerate": job.force_regenerate,
        "use_rag": job.use_rag,
        "active": active,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "error_message": job.error_message,
    }
