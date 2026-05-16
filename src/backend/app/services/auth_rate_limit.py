import hashlib
import hmac
from time import time
from typing import Iterable

from fastapi import HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth_rate_limit_bucket import AuthRateLimitBucket


AUTH_RATE_LIMIT_MESSAGE = "Too many authentication attempts. Try again later."


def get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_password_login_rate_limit(session: Session, client_ip: str, email: str) -> None:
    retry_after = _hit_database_rate_limit(
        session,
        (
            f"auth:login:ip:{client_ip}",
            _email_bucket_key("auth:login", email),
        ),
        max_attempts=settings.auth_login_rate_limit_max_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_register_rate_limit(session: Session, client_ip: str, email: str) -> None:
    retry_after = _hit_database_rate_limit(
        session,
        (
            f"auth:register:ip:{client_ip}",
            _email_bucket_key("auth:register", email),
        ),
        max_attempts=settings.auth_register_rate_limit_max_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_password_change_rate_limit(session: Session, client_ip: str, user_id: int) -> None:
    retry_after = _hit_database_rate_limit(
        session,
        (
            f"auth:password-change:user:{user_id}",
            f"auth:password-change:user-ip:{user_id}:{client_ip}",
        ),
        max_attempts=settings.auth_password_change_rate_limit_max_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_google_login_rate_limit(session: Session, client_ip: str) -> None:
    retry_after = _hit_database_rate_limit(
        session,
        (f"auth:google:ip:{client_ip}",),
        max_attempts=settings.auth_google_rate_limit_max_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def enforce_avatar_upload_rate_limit(session: Session, client_ip: str, user_id: int) -> None:
    retry_after = _hit_database_rate_limit(
        session,
        (
            f"auth:avatar-upload:user:{user_id}",
            f"auth:avatar-upload:user-ip:{user_id}:{client_ip}",
        ),
        max_attempts=settings.auth_avatar_upload_rate_limit_max_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    _raise_if_limited(retry_after)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _email_bucket_key(scope: str, email: str) -> str:
    digest = hmac.new(
        settings.auth_secret.encode("utf-8"),
        _normalize_email(email).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{scope}:email-hmac-sha256:{digest}"


def _hit_database_rate_limit(
    session: Session,
    keys: Iterable[str],
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
                retry_after = max(retry_after, window - (now_epoch - bucket.window_start_epoch))

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
        return _hit_database_rate_limit(
            session,
            key_list,
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
        detail=AUTH_RATE_LIMIT_MESSAGE,
        headers={"Retry-After": str(retry_after)},
    )
