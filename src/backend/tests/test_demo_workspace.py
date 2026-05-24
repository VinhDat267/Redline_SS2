import shutil

from app.core.config import BACKEND_ROOT
from app.models import Document, DocumentParseRun, DocumentTable, DocumentVersion


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


def test_demo_seed_prepopulates_full_documents_once(
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
            documents = list(
                session.query(Document)
                .filter(Document.project_id == project_id)
                .order_by(Document.id)
            )
            versions = list(
                session.query(DocumentVersion)
                .join(Document)
                .filter(Document.project_id == project_id)
                .order_by(DocumentVersion.id)
            )
            active_parse_run_ids = {version.id: version.active_parse_run_id for version in versions}
            parse_run_count = session.query(DocumentParseRun).count()
            table_count = session.query(DocumentTable).count()

        assert [(document.title, document.document_type) for document in documents] == [
            ("Master Services Agreement", "MSA"),
            ("Statement of Work", "SOW"),
            ("Security Addendum", "DPA"),
        ]
        assert [version.version_label for version in versions] == ["v1.1", "v2.0", "v1.0", "v2.0", "v1.0"]
        assert all(version.parse_status in {"parsed", "parsed_with_warnings"} for version in versions)
        assert all(active_parse_run_ids.values())
        assert parse_run_count == len(versions)
        assert table_count > 0

        second_seed_response = client.post("/api/v1/demo/seed", headers=auth_headers)
        assert second_seed_response.status_code == 200

        with session_factory() as session:
            versions_after_second_seed = list(
                session.query(DocumentVersion)
                .join(Document)
                .filter(Document.project_id == project_id)
                .order_by(DocumentVersion.id)
            )
            active_parse_run_ids_after_second_seed = {
                version.id: version.active_parse_run_id
                for version in versions_after_second_seed
            }
            parse_run_count_after_second_seed = session.query(DocumentParseRun).count()

        assert active_parse_run_ids_after_second_seed == active_parse_run_ids
        assert parse_run_count_after_second_seed == parse_run_count
    finally:
        shutil.rmtree(uploads_dir, ignore_errors=True)
