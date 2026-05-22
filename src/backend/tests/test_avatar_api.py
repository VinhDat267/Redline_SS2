"""Tests for avatar upload and delete API endpoints."""
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.core.config import settings
from app.models import User
from app.services import avatar as avatar_service
from tests.test_upload_storage import _enable_fake_object_storage


def _make_test_image(width=200, height=200, fmt="PNG", color=(30, 144, 255)) -> BytesIO:
    """Create a minimal in-memory test image."""
    img = Image.new("RGB", (width, height), color)
    buf = BytesIO()
    img.save(buf, format=fmt)
    buf.seek(0)
    buf.name = f"test_avatar.{fmt.lower()}"
    return buf


class FailingSession:
    def __init__(self) -> None:
        self.rolled_back = False

    def commit(self) -> None:
        raise RuntimeError("database commit failed")

    def rollback(self) -> None:
        self.rolled_back = True

    def refresh(self, user) -> None:
        pass


class FakeUploadFile:
    def __init__(self, file: BytesIO, content_type: str = "image/png") -> None:
        self.file = file
        self.content_type = content_type


def _seed_existing_avatar(tmp_path: Path, user_id: int = 42) -> tuple[User, Path]:
    avatar_dir = tmp_path / "avatars" / f"user-{user_id}"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    avatar_file = avatar_dir / "old.webp"
    avatar_file.write_bytes(b"old-avatar")
    user = User(
        id=user_id,
        email="atomic-avatar@example.com",
        display_name="Atomic Avatar",
        password_hash="hash",
        avatar_path=f"user-{user_id}/old.webp",
        is_active=True,
    )
    return user, avatar_file


def test_upload_keeps_existing_avatar_when_database_commit_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path), raising=False)
    user, old_avatar = _seed_existing_avatar(tmp_path)
    session = FailingSession()

    with pytest.raises(RuntimeError, match="database commit failed"):
        avatar_service.upload_avatar(session, user, FakeUploadFile(_make_test_image()))

    assert session.rolled_back is True
    assert user.avatar_path == "user-42/old.webp"
    assert old_avatar.read_bytes() == b"old-avatar"
    assert list(old_avatar.parent.glob("*.webp")) == [old_avatar]


def test_delete_keeps_existing_avatar_when_database_commit_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path), raising=False)
    user, old_avatar = _seed_existing_avatar(tmp_path)
    session = FailingSession()

    with pytest.raises(RuntimeError, match="database commit failed"):
        avatar_service.delete_avatar(session, user)

    assert session.rolled_back is True
    assert user.avatar_path == "user-42/old.webp"
    assert old_avatar.read_bytes() == b"old-avatar"


class TestAvatarUpload:
    """POST /api/v1/auth/me/avatar"""

    def test_upload_avatar_returns_avatar_url(self, client, auth_headers):
        image = _make_test_image()
        response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.png", image, "image/png")},
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["avatar_url"] is not None
        assert data["avatar_url"].startswith("/uploads/avatars/")
        assert data["avatar_url"].endswith(".webp")

    def test_upload_avatar_persists_across_requests(self, client, auth_headers):
        image = _make_test_image()
        client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.png", image, "image/png")},
        )

        # Fetch current user and verify avatar is persisted
        me_response = client.get("/api/v1/auth/me", headers=auth_headers)
        assert me_response.status_code == 200
        data = me_response.json()["data"]
        assert data["avatar_url"] is not None
        assert data["avatar_url"].startswith("/uploads/avatars/")

    def test_upload_replaces_previous_avatar(self, client, auth_headers):
        img1 = _make_test_image(100, 100, color=(255, 0, 0))
        r1 = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("a1.png", img1, "image/png")},
        )
        url1 = r1.json()["data"]["avatar_url"]

        img2 = _make_test_image(150, 150, color=(0, 0, 255))
        r2 = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("a2.png", img2, "image/png")},
        )
        url2 = r2.json()["data"]["avatar_url"]

        # URL should change (different content hash)
        assert url1 != url2

    def test_upload_rejects_unsupported_content_type(self, client, auth_headers):
        fake_file = BytesIO(b"not an image")
        fake_file.name = "malicious.txt"
        response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("malicious.txt", fake_file, "text/plain")},
        )
        assert response.status_code == 422

    def test_upload_rejects_empty_file(self, client, auth_headers):
        empty = BytesIO(b"")
        response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("empty.png", empty, "image/png")},
        )
        assert response.status_code == 422

    def test_upload_rejects_truncated_image_without_500(self, client, auth_headers):
        image = _make_test_image(width=1000, height=1000)
        truncated = BytesIO(image.getvalue()[:-100])
        truncated.name = "truncated.png"

        response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("truncated.png", truncated, "image/png")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid image file."

    def test_upload_rate_limits_by_user_and_ip(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr(settings, "auth_avatar_upload_rate_limit_max_attempts", 2, raising=False)
        monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)

        for index in range(2):
            image = _make_test_image(color=(30 + index, 144, 255))
            response = client.post(
                "/api/v1/auth/me/avatar",
                headers=auth_headers,
                files={"file": (f"avatar-{index}.png", image, "image/png")},
            )
            assert response.status_code == 200

        limited_image = _make_test_image(color=(50, 144, 255))
        limited_response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar-limited.png", limited_image, "image/png")},
        )
        assert limited_response.status_code == 429
        assert limited_response.headers["Retry-After"].isdigit()

    def test_upload_requires_authentication(self, client):
        image = _make_test_image()
        response = client.post(
            "/api/v1/auth/me/avatar",
            files={"file": ("avatar.png", image, "image/png")},
        )
        assert response.status_code == 401

    def test_upload_accepts_jpeg(self, client, auth_headers):
        image = _make_test_image(fmt="JPEG")
        response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.jpg", image, "image/jpeg")},
        )
        assert response.status_code == 200
        assert response.json()["data"]["avatar_url"].endswith(".webp")

    def test_upload_accepts_webp(self, client, auth_headers):
        image = _make_test_image(fmt="WEBP")
        response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.webp", image, "image/webp")},
        )
        assert response.status_code == 200
        assert response.json()["data"]["avatar_url"].endswith(".webp")

    def test_upload_avatar_uses_object_storage_backend(self, client, auth_headers, monkeypatch):
        fake_client = _enable_fake_object_storage(monkeypatch)
        image = _make_test_image()

        response = client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.png", image, "image/png")},
        )

        assert response.status_code == 200
        avatar_url = response.json()["data"]["avatar_url"]
        assert avatar_url.startswith("/uploads/avatars/user-1/")
        avatar_key = f"avatars/{avatar_url.removeprefix('/uploads/avatars/')}"
        assert avatar_key in {key for _bucket, key in fake_client.objects}


class TestAvatarDelete:
    """DELETE /api/v1/auth/me/avatar"""

    def test_delete_avatar_clears_url(self, client, auth_headers):
        # First upload
        image = _make_test_image()
        client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.png", image, "image/png")},
        )

        # Then delete
        response = client.delete("/api/v1/auth/me/avatar", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["avatar_url"] is None

    def test_delete_avatar_persists(self, client, auth_headers):
        image = _make_test_image()
        client.post(
            "/api/v1/auth/me/avatar",
            headers=auth_headers,
            files={"file": ("avatar.png", image, "image/png")},
        )
        client.delete("/api/v1/auth/me/avatar", headers=auth_headers)

        me_response = client.get("/api/v1/auth/me", headers=auth_headers)
        assert me_response.json()["data"]["avatar_url"] is None

    def test_delete_avatar_when_none_exists_succeeds(self, client, auth_headers):
        response = client.delete("/api/v1/auth/me/avatar", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["data"]["avatar_url"] is None

    def test_delete_requires_authentication(self, client):
        response = client.delete("/api/v1/auth/me/avatar")
        assert response.status_code == 401
