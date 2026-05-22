from __future__ import annotations

from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Iterator
from urllib.parse import quote

from fastapi import HTTPException, UploadFile, status

from app.core.config import BACKEND_ROOT, settings


UPLOAD_CHUNK_BYTES = 1024 * 1024


def uploads_root() -> Path:
    return Path(settings.uploads_dir)


def uses_object_storage() -> bool:
    return settings.upload_storage_backend == "object"


def to_stored_upload_path(file_path: Path) -> str:
    return file_path.relative_to(uploads_root()).as_posix()


def normalize_stored_upload_path(stored_path: str) -> str:
    normalized = stored_path.replace("\\", "/").lstrip("/")
    parts = normalized.split("/")
    if not normalized or any(part in {"", ".", ".."} for part in parts):
        raise ValueError("stored upload path cannot be empty or contain traversal segments")
    return normalized


def store_upload_file(
    upload_file: UploadFile,
    stored_path: str,
    *,
    max_bytes: int,
    content_type: str | None = None,
    limit_error_prefix: str = "Upload",
) -> str:
    normalized_path = normalize_stored_upload_path(stored_path)
    if uses_object_storage():
        payload = _read_upload_file_with_limit(
            upload_file,
            max_bytes,
            limit_error_prefix=limit_error_prefix,
        )
        return store_bytes(normalized_path, payload, content_type=content_type)

    target_path = uploads_root() / normalized_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    _copy_upload_file_with_limit(
        upload_file,
        target_path,
        max_bytes=max_bytes,
        limit_error_prefix=limit_error_prefix,
    )
    return to_stored_upload_path(target_path)


def store_bytes(stored_path: str, payload: bytes, *, content_type: str | None = None) -> str:
    normalized_path = normalize_stored_upload_path(stored_path)
    if uses_object_storage():
        _build_object_storage_client().put_object(
            Bucket=_object_storage_bucket(),
            Key=normalized_path,
            Body=payload,
            ContentType=content_type,
        )
        return normalized_path

    target_path = uploads_root() / normalized_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(payload)
    return to_stored_upload_path(target_path)


def delete_stored_upload(stored_path: str | None) -> None:
    if not stored_path:
        return
    if uses_object_storage():
        normalized_path = normalize_stored_upload_path(stored_path)
        try:
            _build_object_storage_client().delete_object(
                Bucket=_object_storage_bucket(),
                Key=normalized_path,
            )
        except Exception:
            pass
    local_path = resolve_stored_upload_path(stored_path)
    try:
        local_path.unlink(missing_ok=True)
    except OSError:
        pass


@contextmanager
def open_stored_upload_as_path(stored_path: str, *, suffix: str | None = None) -> Iterator[Path]:
    if not uses_object_storage():
        yield resolve_stored_upload_path(stored_path)
        return

    normalized_path = normalize_stored_upload_path(stored_path)
    suffix = suffix if suffix is not None else Path(normalized_path).suffix
    response = _build_object_storage_client().get_object(
        Bucket=_object_storage_bucket(),
        Key=normalized_path,
    )
    body = response["Body"]
    payload = body.read()
    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(payload)
            temporary_path = Path(temp_file.name)
        yield temporary_path
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def read_stored_upload_bytes(stored_path: str) -> bytes:
    if uses_object_storage():
        normalized_path = normalize_stored_upload_path(stored_path)
        response = _build_object_storage_client().get_object(
            Bucket=_object_storage_bucket(),
            Key=normalized_path,
        )
        return response["Body"].read()
    return resolve_stored_upload_path(stored_path).read_bytes()


def public_url_for_stored_upload(stored_path: str) -> str | None:
    if not uses_object_storage() or not settings.object_storage_public_base_url:
        return None
    normalized_path = normalize_stored_upload_path(stored_path)
    escaped_path = quote(normalized_path, safe="/")
    return f"{settings.object_storage_public_base_url.rstrip('/')}/{escaped_path}"


def resolve_stored_upload_path(stored_path: str) -> Path:
    file_path = Path(stored_path)
    if file_path.is_absolute():
        return file_path

    uploads_candidate = uploads_root() / file_path
    if uploads_candidate.exists():
        return uploads_candidate

    # Backward compatibility for rows written before file_path was stored
    # relative to REDLINE_UPLOADS_DIR.
    if file_path.parts and file_path.parts[0] == "uploads":
        return BACKEND_ROOT / file_path

    return uploads_candidate


def _copy_upload_file_with_limit(
    upload_file: UploadFile,
    target_path: Path,
    *,
    max_bytes: int,
    limit_error_prefix: str,
) -> None:
    bytes_written = 0
    try:
        with target_path.open("wb") as output_stream:
            while True:
                chunk = upload_file.file.read(UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f"{limit_error_prefix} must be smaller than {max_bytes // (1024 * 1024)} MB.",
                    )
                output_stream.write(chunk)
    except Exception:
        target_path.unlink(missing_ok=True)
        raise


def _read_upload_file_with_limit(
    upload_file: UploadFile,
    max_bytes: int,
    *,
    limit_error_prefix: str,
) -> bytes:
    buffer = BytesIO()
    bytes_read = 0
    while True:
        chunk = upload_file.file.read(UPLOAD_CHUNK_BYTES)
        if not chunk:
            break
        bytes_read += len(chunk)
        if bytes_read > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"{limit_error_prefix} must be smaller than {max_bytes // (1024 * 1024)} MB.",
            )
        buffer.write(chunk)
    return buffer.getvalue()


def _object_storage_bucket() -> str:
    if not settings.object_storage_bucket:
        raise RuntimeError("REDLINE_OBJECT_STORAGE_BUCKET is not configured")
    return settings.object_storage_bucket


def _build_object_storage_client():
    try:
        import boto3
        from botocore.config import Config
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError("boto3 is required for REDLINE_UPLOAD_STORAGE_BACKEND=object") from exc

    return boto3.client(
        "s3",
        endpoint_url=settings.object_storage_endpoint,
        aws_access_key_id=settings.object_storage_access_key_id,
        aws_secret_access_key=settings.object_storage_secret_access_key,
        region_name=settings.object_storage_region,
        config=Config(s3={"addressing_style": "path"}),
    )
