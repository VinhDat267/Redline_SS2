"""Per-user rate limiting for AI feature endpoints.

Reuses the same database-backed bucket mechanism as auth_rate_limit so that
limits survive restarts and work correctly across multiple workers.
"""

from __future__ import annotations

from time import time

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth_rate_limit_bucket import AuthRateLimitBucket

AI_RATE_LIMIT_MESSAGE = "AI rate limit exceeded. Please wait before trying again."


def enforce_ai_chat_rate_limit(session: Session, user_id: int) -> None:
    """Contract Q&A — per-user limit on chat messages (both sync and streaming)."""
    retry_after = _hit_ai_rate_limit(
        session,
        keys=(f"ai:chat:user:{user_id}",),
        max_attempts=settings.ai_chat_rate_limit_max_attempts,
        window_seconds=settings.ai_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_ai_summary_rate_limit(session: Session, user_id: int) -> None:
    """AI Summary generation — per-user limit."""
    retry_after = _hit_ai_rate_limit(
        session,
        keys=(f"ai:summary:user:{user_id}",),
        max_attempts=settings.ai_summary_rate_limit_max_attempts,
        window_seconds=settings.ai_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_ai_review_draft_rate_limit(session: Session, user_id: int) -> None:
    """Single AI review draft regeneration — per-user limit."""
    retry_after = _hit_ai_rate_limit(
        session,
        keys=(f"ai:review-draft:user:{user_id}",),
        max_attempts=settings.ai_review_draft_rate_limit_max_attempts,
        window_seconds=settings.ai_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_ai_batch_rate_limit(session: Session, user_id: int) -> None:
    """AI batch generation (generate all drafts) — per-user limit."""
    retry_after = _hit_ai_rate_limit(
        session,
        keys=(f"ai:batch:user:{user_id}",),
        max_attempts=settings.ai_batch_rate_limit_max_attempts,
        window_seconds=settings.ai_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_ai_chat_attempt_rate_limit(session: Session, user_id: int) -> None:
    """Chat attempt creation (streaming v2) — per-user limit."""
    retry_after = _hit_ai_rate_limit(
        session,
        keys=(f"ai:chat-attempt:user:{user_id}",),
        max_attempts=settings.ai_chat_rate_limit_max_attempts,
        window_seconds=settings.ai_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


# ---------------------------------------------------------------------------
#  Internal helpers (mirrors auth_rate_limit pattern)
# ---------------------------------------------------------------------------

def _hit_ai_rate_limit(
    session: Session,
    keys: tuple[str, ...],
    *,
    max_attempts: int,
    window_seconds: int,
    retry_on_integrity_error: bool = True,
) -> int | None:
    limit = max(1, int(max_attempts))
    window = max(1, int(window_seconds))
    now_epoch = int(time())
    window_start = now_epoch - (now_epoch % window)
    key_list = list(keys)
    if not key_list:
        return None

    try:
        # Purge expired buckets
        session.execute(
            delete(AuthRateLimitBucket).where(
                AuthRateLimitBucket.window_start_epoch < window_start - window
            )
        )

        buckets: list[tuple[str, AuthRateLimitBucket | None]] = []
        retry_after = 0
        for key in key_list:
            bucket = session.scalar(
                select(AuthRateLimitBucket)
                .where(AuthRateLimitBucket.bucket_key == key)
                .with_for_update()
            )
            if bucket is not None and bucket.window_start_epoch != window_start:
                bucket.window_start_epoch = window_start
                bucket.attempt_count = 0
                bucket.updated_at_epoch = now_epoch

            if bucket is not None and bucket.attempt_count >= limit:
                retry_after = max(
                    retry_after,
                    window - (now_epoch - bucket.window_start_epoch),
                )

            buckets.append((key, bucket))

        if retry_after > 0:
            return max(1, retry_after)

        for key, bucket in buckets:
            if bucket is None:
                session.add(
                    AuthRateLimitBucket(
                        bucket_key=key,
                        window_start_epoch=window_start,
                        attempt_count=1,
                        updated_at_epoch=now_epoch,
                    )
                )
            else:
                bucket.attempt_count += 1
                bucket.updated_at_epoch = now_epoch

        session.commit()
    except IntegrityError:
        session.rollback()
        if not retry_on_integrity_error:
            raise
        return _hit_ai_rate_limit(
            session,
            keys,
            max_attempts=max_attempts,
            window_seconds=window_seconds,
            retry_on_integrity_error=False,
        )

    return None


def _raise_if_limited(retry_after: int | None) -> None:
    if retry_after is None:
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=AI_RATE_LIMIT_MESSAGE,
        headers={"Retry-After": str(retry_after)},
    )
