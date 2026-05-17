from pathlib import Path

from app.core.config import BACKEND_ROOT, settings


def uploads_root() -> Path:
    return Path(settings.uploads_dir)


def to_stored_upload_path(file_path: Path) -> str:
    return file_path.relative_to(uploads_root()).as_posix()


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
