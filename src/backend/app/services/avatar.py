"""Avatar upload service: validate, resize, convert, and persist."""
import hashlib
import time
from io import BytesIO

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.models import User
from app.services.upload_storage import delete_stored_upload, store_bytes


AVATAR_SIZE = (256, 256)
AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
AVATAR_MAX_PIXELS = 4096 * 4096
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _validate_avatar_file(file: UploadFile) -> bytes:
    """Read and validate the uploaded avatar file."""
    content_type = (file.content_type or "").lower().strip()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unsupported image type: {content_type or 'unknown'}. Allowed: JPEG, PNG, WebP, GIF.",
        )

    raw = file.file.read(AVATAR_MAX_BYTES + 1)

    if len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Avatar must be smaller than {AVATAR_MAX_BYTES // (1024 * 1024)} MB.",
        )

    if not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Empty file.",
        )

    return raw


def _process_image(raw: bytes) -> bytes:
    """Resize to square, convert to WebP."""
    try:
        with Image.open(BytesIO(raw)) as source:
            width, height = source.size
            if width <= 0 or height <= 0:
                raise ValueError("Image dimensions must be positive")
            if width * height > AVATAR_MAX_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Avatar image dimensions are too large.",
                )

            source.load()
            img = ImageOps.exif_transpose(source).copy()
    except HTTPException:
        raise
    except Image.DecompressionBombError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Avatar image dimensions are too large.",
        ) from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid image file.",
        ) from exc

    if img.mode == "RGBA":
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[3])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize(AVATAR_SIZE, Image.LANCZOS)

    buf = BytesIO()
    img.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


def _save_avatar(user_id: int, webp_bytes: bytes) -> str:
    """Persist avatar and return relative path from avatars root."""
    content_hash = hashlib.sha256(webp_bytes).hexdigest()[:12]
    filename = f"{int(time.time())}_{content_hash}.webp"
    relative_path = f"user-{user_id}/{filename}"
    store_bytes(f"avatars/{relative_path}", webp_bytes, content_type="image/webp")
    return relative_path


def _delete_avatar_file(relative_path: str | None) -> None:
    if not relative_path:
        return
    delete_stored_upload(f"avatars/{relative_path}")


def upload_avatar(session: Session, user: User, file: UploadFile) -> User:
    """Full avatar upload pipeline: validate, process, save, update DB."""
    previous_avatar_path = user.avatar_path
    raw = _validate_avatar_file(file)
    webp_bytes = _process_image(raw)
    relative_path = _save_avatar(user.id, webp_bytes)

    try:
        user.avatar_path = relative_path
        session.commit()
    except Exception:
        session.rollback()
        user.avatar_path = previous_avatar_path
        _delete_avatar_file(relative_path)
        raise

    session.refresh(user)
    if previous_avatar_path != relative_path:
        _delete_avatar_file(previous_avatar_path)
    return user


def delete_avatar(session: Session, user: User) -> User:
    """Remove the current avatar."""
    previous_avatar_path = user.avatar_path

    try:
        user.avatar_path = None
        session.commit()
    except Exception:
        session.rollback()
        user.avatar_path = previous_avatar_path
        raise

    session.refresh(user)
    _delete_avatar_file(previous_avatar_path)
    return user
