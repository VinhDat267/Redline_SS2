import shutil

from app.core.config import BACKEND_ROOT
from app.models import Document, DocumentVersion


def test_seeded_demo_docx_versions_can_be_reparsed(
    monkeypatch,
    tmp_path,
    client,
    auth_headers,
    session_factory,
):
    uploads_dir = BACKEND_ROOT / "uploads" / "pytest-demo-workspace" / tmp_path.name
    shutil.rmtree(uploads_dir, ignore_errors=True)
    monkeypatch.setattr("app.services.demo.settings.uploads_dir", str(uploads_dir))

    try:
        seed_response = client.post("/api/v1/demo/seed", headers=auth_headers)
        assert seed_response.status_code == 200

        project_id = seed_response.json()["data"]["project"]["id"]
        with session_factory() as session:
            versions = list(
                session.query(DocumentVersion)
                .join(Document)
                .filter(Document.project_id == project_id, DocumentVersion.file_name.like("%.docx"))
                .order_by(DocumentVersion.id)
            )

        assert versions
        for version in versions:
            parse_response = client.post(f"/api/v1/document-versions/{version.id}/parse", headers=auth_headers)
            assert parse_response.status_code == 200
            payload = parse_response.json()["data"]
            assert payload["parse_status"] in {"parsed", "parsed_with_warnings"}
            assert payload["active_parse_run_id"] is not None
    finally:
        shutil.rmtree(uploads_dir, ignore_errors=True)
