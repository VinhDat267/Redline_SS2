"""Tests for the project analytics endpoint."""

from io import BytesIO

from docx import Document as DocxDocument


def _build_docx(body_paragraphs):
    document = DocxDocument()
    for text, style in body_paragraphs:
        paragraph = document.add_paragraph(text)
        if style is not None:
            paragraph.style = style
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _setup_project_with_compare(client, auth_headers):
    """Create a project, document, upload 2 versions, parse, and compare."""
    project_resp = client.post(
        "/api/v1/projects",
        json={"name": "Analytics Project", "description": "Test analytics"},
        headers=auth_headers,
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["data"]["id"]

    doc_resp = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={"title": "Analytics Spec", "document_type": "SRS"},
        headers=auth_headers,
    )
    assert doc_resp.status_code == 201
    document_id = doc_resp.json()["data"]["id"]

    source = _build_docx([
        ("Requirements", "Heading 1"),
        ("The system shall support login.", None),
        ("The system shall write audit logs.", None),
    ])
    target = _build_docx([
        ("Requirements", "Heading 1"),
        ("The system shall support MFA login.", None),
        ("The system shall write audit logs.", None),
        ("The system shall enforce session timeout.", None),
    ])

    for label, payload in [("v1.0", source), ("v2.0", target)]:
        resp = client.post(
            f"/api/v1/documents/{document_id}/versions",
            files={"file": (f"{label}.docx", payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            data={"version_label": label},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        version_id = resp.json()["data"]["id"]
        parse_resp = client.post(f"/api/v1/document-versions/{version_id}/parse", headers=auth_headers)
        assert parse_resp.status_code == 200

    versions_resp = client.get(f"/api/v1/documents/{document_id}/versions", headers=auth_headers)
    versions = versions_resp.json()["data"]
    source_id = next(v["id"] for v in versions if v["version_label"] == "v1.0")
    target_id = next(v["id"] for v in versions if v["version_label"] == "v2.0")

    compare_resp = client.post(
        f"/api/v1/documents/{document_id}/compare-runs",
        json={"source_version_id": source_id, "target_version_id": target_id},
        headers=auth_headers,
    )
    assert compare_resp.status_code == 201

    return project_id


def test_analytics_returns_change_type_and_review_counts(client, auth_headers):
    project_id = _setup_project_with_compare(client, auth_headers)

    resp = client.get(f"/api/v1/projects/{project_id}/analytics", headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()["data"]

    assert data["total_changes"] > 0
    assert data["total_compare_runs"] == 1
    assert isinstance(data["change_types"], dict)
    assert "added" in data["change_types"]
    assert "removed" in data["change_types"]
    assert "modified" in data["change_types"]
    assert isinstance(data["review_status"], dict)
    assert "open" in data["review_status"]
    assert "resolved" in data["review_status"]
    assert isinstance(data["per_document"], list)
    assert len(data["per_document"]) == 1
    assert data["per_document"][0]["title"] == "Analytics Spec"


def test_analytics_returns_empty_for_project_without_compares(client, auth_headers):
    project_resp = client.post(
        "/api/v1/projects",
        json={"name": "Empty Project", "description": "No documents"},
        headers=auth_headers,
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["data"]["id"]

    resp = client.get(f"/api/v1/projects/{project_id}/analytics", headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["total_changes"] == 0
    assert data["total_compare_runs"] == 0
    assert data["ai_accuracy_pct"] is None
    assert data["ai_avg_confidence"] is None


def test_analytics_requires_authentication(client, auth_headers):
    project_resp = client.post(
        "/api/v1/projects",
        json={"name": "Auth Test", "description": "Test"},
        headers=auth_headers,
    )
    project_id = project_resp.json()["data"]["id"]

    resp = client.get(f"/api/v1/projects/{project_id}/analytics")
    assert resp.status_code == 401
