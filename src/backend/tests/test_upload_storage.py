from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.services import upload_storage


class FakeObjectStorageClient:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], tuple[bytes, str | None]] = {}
        self.deleted: list[tuple[str, str]] = []

    def put_object(self, *, Bucket, Key, Body, ContentType=None):
        payload = Body.read() if hasattr(Body, "read") else Body
        self.objects[(Bucket, Key)] = (bytes(payload), ContentType)

    def get_object(self, *, Bucket, Key):
        payload, _content_type = self.objects[(Bucket, Key)]
        return {"Body": BytesIO(payload)}

    def delete_object(self, *, Bucket, Key):
        self.deleted.append((Bucket, Key))
        self.objects.pop((Bucket, Key), None)


def _enable_fake_object_storage(monkeypatch) -> FakeObjectStorageClient:
    fake_client = FakeObjectStorageClient()
    monkeypatch.setattr(settings, "upload_storage_backend", "object", raising=False)
    monkeypatch.setattr(settings, "object_storage_bucket", "redline-test", raising=False)
    monkeypatch.setattr(settings, "object_storage_endpoint", "https://storage.example.test", raising=False)
    monkeypatch.setattr(settings, "object_storage_access_key_id", "test-key", raising=False)
    monkeypatch.setattr(settings, "object_storage_secret_access_key", "test-secret", raising=False)
    monkeypatch.setattr(settings, "object_storage_region", "auto", raising=False)
    monkeypatch.setattr(settings, "object_storage_public_base_url", "https://cdn.example.test/redline", raising=False)
    monkeypatch.setattr(upload_storage, "_build_object_storage_client", lambda: fake_client)
    return fake_client


def test_object_storage_stores_deletes_and_opens_upload_as_temporary_file(monkeypatch):
    fake_client = _enable_fake_object_storage(monkeypatch)

    stored_path = upload_storage.store_bytes(
        "avatars/user-1/avatar.webp",
        b"avatar-bytes",
        content_type="image/webp",
    )

    assert stored_path == "avatars/user-1/avatar.webp"
    assert fake_client.objects[("redline-test", stored_path)] == (b"avatar-bytes", "image/webp")
    assert upload_storage.public_url_for_stored_upload(stored_path) == (
        "https://cdn.example.test/redline/avatars/user-1/avatar.webp"
    )

    with upload_storage.open_stored_upload_as_path(stored_path, suffix=".webp") as file_path:
        assert file_path.exists()
        assert file_path.read_bytes() == b"avatar-bytes"
        temp_path = Path(file_path)

    assert not temp_path.exists()

    upload_storage.delete_stored_upload(stored_path)

    assert fake_client.deleted == [("redline-test", stored_path)]
    assert ("redline-test", stored_path) not in fake_client.objects


@pytest.mark.parametrize(
    "stored_path",
    ["", "../secret.docx", "document-1/../secret.docx", "document-1//secret.docx", "document-1/./secret.docx"],
)
def test_stored_upload_path_rejects_traversal_segments(stored_path):
    with pytest.raises(ValueError, match="stored upload path"):
        upload_storage.normalize_stored_upload_path(stored_path)


def test_local_storage_helpers_keep_legacy_absolute_paths(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_storage_backend", "local", raising=False)
    legacy_path = tmp_path / "legacy.docx"
    legacy_path.write_bytes(b"legacy-document")

    with upload_storage.open_stored_upload_as_path(str(legacy_path), suffix=".docx") as file_path:
        assert file_path == legacy_path
        assert file_path.read_bytes() == b"legacy-document"

    assert upload_storage.read_stored_upload_bytes(str(legacy_path)) == b"legacy-document"

    upload_storage.delete_stored_upload(str(legacy_path))

    assert not legacy_path.exists()


def test_object_avatar_route_redirects_to_public_storage_url(monkeypatch):
    _enable_fake_object_storage(monkeypatch)
    app = create_app(start_ai_worker=False)

    response = TestClient(app).get("/uploads/avatars/user-1/avatar.webp", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "https://cdn.example.test/redline/avatars/user-1/avatar.webp"
