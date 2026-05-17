from io import BytesIO
from pathlib import Path

import fitz
import pytest
from docx import Document as DocxDocument
from sqlalchemy import select

from app.models import DocumentBlock, DocumentParseRun, DocumentSurface, DocumentVersion
from app.services import documents as document_service


def _build_docx_bytes(paragraphs: list[tuple[str, str | None]]) -> bytes:
    document = DocxDocument()
    for text, style in paragraphs:
        paragraph = document.add_paragraph(text)
        if style is not None:
            paragraph.style = style

    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _build_pdf_bytes() -> bytes:
    document = fitz.open()
    page = document.new_page(width=612, height=792)
    page.insert_text((72, 72), "1. Definitions\nAgreement means this contract.", fontsize=11)
    payload = document.tobytes()
    document.close()
    return payload


def test_document_crud_flow(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Document Demo", "description": "CRUD parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Software Requirements Specification",
            "document_type": "SRS",
            "description": "Current demo document",
        },
        headers=auth_headers,
    )

    assert create_response.status_code == 201
    created_document = create_response.json()["data"]
    document_id = created_document["id"]
    assert created_document["title"] == "Software Requirements Specification"

    list_response = client.get(f"/api/v1/projects/{project_id}/documents", headers=auth_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    detail_response = client.get(f"/api/v1/documents/{document_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["document_type"] == "SRS"

    update_response = client.patch(
        f"/api/v1/documents/{document_id}",
        json={"title": "Updated SRS", "description": "Updated description"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["title"] == "Updated SRS"

    delete_response = client.delete(f"/api/v1/documents/{document_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/documents/{document_id}", headers=auth_headers)
    assert missing_response.status_code == 404


def test_document_version_crud_flow(client, seeded_users, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Version Demo", "description": "Version parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Design Spec",
            "document_type": "SPEC",
            "description": "Design baseline",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={"file": ("design-v1.docx", b"fake-docx-content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        data={"version_label": "v1.0", "notes": "Initial version", "actor_user_id": seeded_users[0].id},
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    created_version = create_response.json()["data"]
    version_id = created_version["id"]
    assert created_version["version_label"] == "v1.0"
    assert created_version["parse_status"] == "pending"

    list_response = client.get(f"/api/v1/documents/{document_id}/versions", headers=auth_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    detail_response = client.get(f"/api/v1/document-versions/{version_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["file_name"] == "design-v1.docx"

    update_response = client.patch(
        f"/api/v1/document-versions/{version_id}",
        json={"notes": "Updated notes"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["notes"] == "Updated notes"
    assert update_response.json()["data"]["parse_status"] == "pending"

    delete_response = client.delete(f"/api/v1/document-versions/{version_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/document-versions/{version_id}", headers=auth_headers)
    assert missing_response.status_code == 404


def test_update_document_version_rejects_parse_status_mutation(client, seeded_users, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Parse Status Guard", "description": "Parser truth is server-owned"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Guarded Version",
            "document_type": "SPEC",
            "description": "Parse status target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "guarded-v1.docx",
                b"fake-docx-content",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0", "actor_user_id": seeded_users[0].id},
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    version_id = create_response.json()["data"]["id"]

    update_response = client.patch(
        f"/api/v1/document-versions/{version_id}",
        json={"parse_status": "parsed"},
        headers=auth_headers,
    )

    assert update_response.status_code == 422

    detail_response = client.get(f"/api/v1/document-versions/{version_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["parse_status"] == "pending"


def test_delete_document_version_preserves_file_when_db_commit_fails(
    client,
    auth_headers,
    session_factory,
    monkeypatch,
):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Delete Rollback Demo", "description": "File consistency"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Rollback Spec",
            "document_type": "SPEC",
            "description": "Delete rollback target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "rollback-v1.docx",
                b"fake-docx-content",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    version_id = payload["id"]
    file_path = document_service.resolve_stored_upload_path(payload["file_path"])
    assert file_path.exists()

    with session_factory() as session:
        version = session.get(DocumentVersion, version_id)
        assert version is not None

        def fail_commit():
            raise RuntimeError("simulated commit failure")

        monkeypatch.setattr(session, "commit", fail_commit)

        with pytest.raises(RuntimeError, match="simulated commit failure"):
            document_service.delete_document_version(session, version)
        session.rollback()

    assert file_path.exists()
    with session_factory() as session:
        assert session.get(DocumentVersion, version_id) is not None


def test_document_version_upload_accepts_pdf_file(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "PDF Upload Demo", "description": "PDF upload parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "PDF Contract",
            "document_type": "CONTRACT",
            "description": "PDF upload target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={"file": ("contract-v1.pdf", _build_pdf_bytes(), "application/pdf")},
        data={"version_label": "v1.0", "notes": "PDF draft"},
        headers=auth_headers,
    )

    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert payload["file_name"] == "contract-v1.pdf"
    assert payload["file_path"].endswith(".pdf")
    assert payload["parse_status"] == "pending"


def test_document_version_upload_supports_external_uploads_dir(
    client,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    external_uploads_dir = tmp_path / "mounted-uploads"
    monkeypatch.setattr(document_service.settings, "uploads_dir", str(external_uploads_dir), raising=False)

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "External Uploads Demo", "description": "Mounted upload storage"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "External Storage Contract",
            "document_type": "CONTRACT",
            "description": "Upload path target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "external-v1.docx",
                _build_docx_bytes([("Storage", "Heading 1"), ("Files live outside the backend root.", None)]),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )

    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert not Path(payload["file_path"]).is_absolute()
    assert (external_uploads_dir / payload["file_path"]).exists()

    parse_response = client.post(
        f"/api/v1/document-versions/{payload['id']}/parse",
        headers=auth_headers,
    )
    assert parse_response.status_code == 200
    assert parse_response.json()["data"]["parse_status"] == "parsed"

    delete_response = client.delete(
        f"/api/v1/document-versions/{payload['id']}",
        headers=auth_headers,
    )
    assert delete_response.status_code == 204
    assert not (external_uploads_dir / payload["file_path"]).exists()


def test_document_version_upload_rejects_files_above_configured_limit(
    client,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    uploads_dir = tmp_path / "limited-uploads"
    monkeypatch.setattr(document_service.settings, "uploads_dir", str(uploads_dir), raising=False)
    monkeypatch.setattr(document_service.settings, "document_upload_max_bytes", 8, raising=False)

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Upload Limit Demo", "description": "Reject large files"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Limited Upload Contract",
            "document_type": "CONTRACT",
            "description": "Upload limit target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "too-large.docx",
                b"123456789",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )

    assert create_response.status_code == 413
    assert "Document upload must be smaller" in create_response.json()["detail"]
    assert [path for path in uploads_dir.rglob("*") if path.is_file()] == []


def test_document_version_upload_rejects_unsupported_file_suffix(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Unsupported Upload Demo", "description": "Upload validation parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Unsupported Contract",
            "document_type": "CONTRACT",
            "description": "Unsupported upload target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={"file": ("contract-v1.txt", b"plain text", "text/plain")},
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )

    assert create_response.status_code == 422
    assert create_response.json()["detail"] == "Only .docx and .pdf files are supported"


def test_update_document_version_allows_version_label_changes(client, seeded_users, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Version Rename Demo", "description": "Version rename parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Rename Spec",
            "document_type": "SPEC",
            "description": "Rename target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "rename-v1.docx",
                b"fake-docx-content",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0", "notes": "Initial notes", "actor_user_id": seeded_users[0].id},
        headers=auth_headers,
    )
    version_id = create_response.json()["data"]["id"]

    update_response = client.patch(
        f"/api/v1/document-versions/{version_id}",
        json={"version_label": "v1.1", "notes": "Retitled version"},
        headers=auth_headers,
    )

    assert update_response.status_code == 200
    payload = update_response.json()["data"]
    assert payload["version_label"] == "v1.1"
    assert payload["notes"] == "Retitled version"
    assert payload["parse_status"] == "pending"


def test_update_document_version_rejects_duplicate_version_label(client, seeded_users, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Version Conflict Demo", "description": "Version conflict parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Conflict Spec",
            "document_type": "SPEC",
            "description": "Conflict target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    first_version_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "conflict-v1.docx",
                b"fake-docx-content",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0", "actor_user_id": seeded_users[0].id},
        headers=auth_headers,
    )
    second_version_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "conflict-v2.docx",
                b"fake-docx-content",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v2.0", "actor_user_id": seeded_users[0].id},
        headers=auth_headers,
    )

    update_response = client.patch(
        f"/api/v1/document-versions/{second_version_response.json()['data']['id']}",
        json={"version_label": first_version_response.json()["data"]["version_label"]},
        headers=auth_headers,
    )

    assert update_response.status_code == 409
    assert update_response.json()["detail"] == "Version already exists"


def test_document_version_parse_flow(client, auth_headers, session_factory):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Parse Demo", "description": "Parser parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Parser Spec",
            "document_type": "SPEC",
            "description": "Parser target document",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    docx_bytes = _build_docx_bytes(
        [
            ("Introduction", "Heading 1"),
            ("This document describes parser flow.", None),
            ("- Keep it deterministic", None),
        ]
    )
    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "parser-v1.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0", "notes": "Ready to parse"},
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    version_id = create_response.json()["data"]["id"]

    parse_response = client.post(
        f"/api/v1/document-versions/{version_id}/parse",
        headers=auth_headers,
    )

    assert parse_response.status_code == 200
    payload = parse_response.json()["data"]
    assert payload["parse_status"] == "parsed"
    assert payload["parsed_snapshot"] is not None
    assert payload["active_parse_run_id"] is not None
    assert payload["warning_count"] == 0
    assert payload["parser_version"] == "v1"

    with session_factory() as session:
        version = session.get(DocumentVersion, version_id)
        parse_runs = list(
            session.scalars(
                select(DocumentParseRun)
                .where(DocumentParseRun.document_version_id == version_id)
                .order_by(DocumentParseRun.id)
            )
        )
        surfaces = list(
            session.scalars(
                select(DocumentSurface)
                .where(DocumentSurface.parse_run_id == version.active_parse_run_id)
                .order_by(DocumentSurface.logical_order_index)
            )
        )
        blocks = list(
            session.scalars(
                select(DocumentBlock)
                .where(DocumentBlock.document_version_id == version_id)
                .order_by(DocumentBlock.order_index)
            )
        )

    assert version is not None
    assert version.parse_status == "parsed"
    assert version.active_parse_run_id is not None
    assert [parse_run.status for parse_run in parse_runs] == ["parsed"]
    assert len(surfaces) == 1
    assert surfaces[0].surface_type == "body"
    assert [block.block_type for block in blocks] == ["heading", "paragraph", "list_item"]
    assert {block.parse_run_id for block in blocks} == {version.active_parse_run_id}
    assert {block.surface_id for block in blocks} == {surfaces[0].id}


def test_document_version_parse_failure_marks_failed(client, auth_headers, session_factory):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Parse Failure Demo", "description": "Parser parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Blank Parser Spec",
            "document_type": "SPEC",
            "description": "Blank parser target document",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    blank_docx_bytes = _build_docx_bytes([("   ", None)])
    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "blank-parser.docx",
                blank_docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    version_id = create_response.json()["data"]["id"]

    parse_response = client.post(
        f"/api/v1/document-versions/{version_id}/parse",
        headers=auth_headers,
    )

    assert parse_response.status_code == 422
    assert "no valid body blocks" in parse_response.json()["detail"]

    with session_factory() as session:
        version = session.get(DocumentVersion, version_id)
        parse_runs = list(
            session.scalars(
                select(DocumentParseRun)
                .where(DocumentParseRun.document_version_id == version_id)
                .order_by(DocumentParseRun.id)
            )
        )
        blocks = list(
            session.scalars(select(DocumentBlock).where(DocumentBlock.document_version_id == version_id))
        )

    assert version is not None
    assert version.parse_status == "failed"
    assert version.active_parse_run_id is None
    assert [parse_run.status for parse_run in parse_runs] == ["failed"]
    assert version.parsed_snapshot is None
    assert blocks == []


def test_list_document_versions_exposes_parser_workspace_fields(client, auth_headers, session_factory):
    document_id, version_id = None, None
    me_response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me_response.status_code == 200
    current_user = me_response.json()["data"]
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Version List Parser Fields", "description": "Parser parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Version List Spec",
            "document_type": "SPEC",
            "description": "Version list parser fields target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]
    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "version-list-parser.docx",
                _build_docx_bytes([("Overview", "Heading 1"), ("Body paragraph.", None)]),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )
    version_id = create_response.json()["data"]["id"]

    parse_response = client.post(
        f"/api/v1/document-versions/{version_id}/parse",
        headers=auth_headers,
    )
    assert parse_response.status_code == 200

    list_response = client.get(f"/api/v1/documents/{document_id}/versions", headers=auth_headers)

    assert list_response.status_code == 200
    payload = list_response.json()["data"]
    assert payload == [
        {
            "id": version_id,
            "document_id": document_id,
            "version_label": "v1.0",
            "file_name": "version-list-parser.docx",
            "file_path": payload[0]["file_path"],
            "uploaded_by_user_id": current_user["id"],
            "parse_status": "parsed",
            "active_parse_run_id": payload[0]["active_parse_run_id"],
            "parsed_snapshot": payload[0]["parsed_snapshot"],
            "uploaded_at": payload[0]["uploaded_at"],
            "notes": None,
            "uploaded_by_display_name": current_user["display_name"],
            "warning_count": 0,
            "parser_version": "v1",
        }
    ]


def test_document_routes_require_project_membership(client, auth_headers, register_user):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Restricted Docs", "description": "Membership enforcement"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Restricted Spec",
            "document_type": "SPEC",
            "description": "Only members can access",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    outsider = register_user(email="docs-outsider@example.com", display_name="Docs Outsider")

    list_response = client.get(
        f"/api/v1/projects/{project_id}/documents",
        headers=outsider["headers"],
    )
    assert list_response.status_code == 404

    detail_response = client.get(f"/api/v1/documents/{document_id}", headers=outsider["headers"])
    assert detail_response.status_code == 404

    upload_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "outsider.docx",
                b"fake-docx-content",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v9.9"},
        headers=outsider["headers"],
    )
    assert upload_response.status_code == 404


def test_document_version_upload_uses_authenticated_user_for_audit(client, seeded_users, auth_headers):
    me_response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me_response.status_code == 200
    current_user_id = me_response.json()["data"]["id"]

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Audit Upload Demo", "description": "Upload audit parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Audit Spec",
            "document_type": "SPEC",
            "description": "Audit target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "audit-v1.docx",
                b"fake-docx-content",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0", "actor_user_id": seeded_users[0].id},
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert payload["uploaded_by_user_id"] == current_user_id
    assert payload["uploaded_by_user_id"] != seeded_users[0].id
