"""Tests for project activity log recording and access control."""

from io import BytesIO

from docx import Document as DocxDocument


def _build_docx(lines: list[str]) -> bytes:
    document = DocxDocument()
    for line in lines:
        document.add_paragraph(line)
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_project_activity_logs_record_core_document_flow(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Activity Project", "description": "Activity log coverage"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={"title": "Activity Spec", "document_type": "SRS"},
        headers=auth_headers,
    )
    assert document_response.status_code == 201
    document_id = document_response.json()["data"]["id"]

    version_ids = []
    for version_label, lines in [
        ("v1.0", ["The system shall support login."]),
        ("v2.0", ["The system shall support login.", "The system shall support MFA."]),
    ]:
        upload_response = client.post(
            f"/api/v1/documents/{document_id}/versions",
            data={"version_label": version_label},
            files={
                "file": (
                    f"{version_label}.docx",
                    _build_docx(lines),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            headers=auth_headers,
        )
        assert upload_response.status_code == 201
        version_id = upload_response.json()["data"]["id"]
        version_ids.append(version_id)

        parse_response = client.post(
            f"/api/v1/document-versions/{version_id}/parse",
            headers=auth_headers,
        )
        assert parse_response.status_code == 200

    compare_response = client.post(
        f"/api/v1/documents/{document_id}/compare-runs",
        json={"source_version_id": version_ids[0], "target_version_id": version_ids[1]},
        headers=auth_headers,
    )
    assert compare_response.status_code == 201

    logs_response = client.get(
        f"/api/v1/projects/{project_id}/activity-logs",
        headers=auth_headers,
    )
    assert logs_response.status_code == 200

    logs = logs_response.json()["data"]
    actions = [log["action"] for log in logs]
    descriptions = [log["description"] for log in logs]

    assert actions[:4] == ["compared", "parsed", "uploaded", "parsed"]
    assert "created" in actions
    assert any('Created document "Activity Spec"' == description for description in descriptions)
    assert all(log["project_id"] == project_id for log in logs)


def test_project_activity_logs_record_contract_facade_flow(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Contract Activity", "description": "Contract facade audit"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Vendor MSA",
            "contract_type": "MSA",
            "description": "Activity contract",
        },
        headers=auth_headers,
    )
    assert contract_response.status_code == 201
    contract_id = contract_response.json()["data"]["id"]

    draft_ids = []
    for draft_label, lines in [
        ("supplier-v1", ["Liability", "The liability cap is $100,000."]),
        ("supplier-v2", ["Liability", "The liability cap is $250,000."]),
    ]:
        upload_response = client.post(
            f"/api/v1/contracts/{contract_id}/drafts",
            data={"draft_label": draft_label},
            files={
                "file": (
                    f"{draft_label}.docx",
                    _build_docx(lines),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            headers=auth_headers,
        )
        assert upload_response.status_code == 201
        draft_id = upload_response.json()["data"]["id"]
        draft_ids.append(draft_id)

        parse_response = client.post(
            f"/api/v1/contract-drafts/{draft_id}/parse",
            headers=auth_headers,
        )
        assert parse_response.status_code == 200

    compare_response = client.post(
        f"/api/v1/contracts/{contract_id}/compare-runs",
        json={"source_draft_id": draft_ids[0], "target_draft_id": draft_ids[1]},
        headers=auth_headers,
    )
    assert compare_response.status_code == 201

    logs_response = client.get(
        f"/api/v1/projects/{project_id}/activity-logs",
        headers=auth_headers,
    )
    assert logs_response.status_code == 200

    logs = logs_response.json()["data"]
    actions = [log["action"] for log in logs]
    descriptions = [log["description"] for log in logs]

    assert actions[:6] == ["compared", "parsed", "uploaded", "parsed", "uploaded", "created"]
    assert 'Created contract "Vendor MSA"' in descriptions
    assert 'Uploaded draft "supplier-v1" to "Vendor MSA"' in descriptions
    assert 'Parsed draft "supplier-v2"' in descriptions
    assert 'Created compare run for contract "Vendor MSA"' in descriptions
    assert all(log["project_id"] == project_id for log in logs)


def test_project_activity_logs_record_contract_facade_deletes(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Contract Delete Activity", "description": "Delete audit"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={"title": "Delete MSA", "contract_type": "MSA"},
        headers=auth_headers,
    )
    assert contract_response.status_code == 201
    contract_id = contract_response.json()["data"]["id"]

    upload_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        data={"draft_label": "delete-v1"},
        files={
            "file": (
                "delete-v1.docx",
                _build_docx(["Delete test"]),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        headers=auth_headers,
    )
    assert upload_response.status_code == 201
    draft_id = upload_response.json()["data"]["id"]

    delete_draft_response = client.delete(
        f"/api/v1/contract-drafts/{draft_id}",
        headers=auth_headers,
    )
    assert delete_draft_response.status_code == 204

    delete_contract_response = client.delete(
        f"/api/v1/contracts/{contract_id}",
        headers=auth_headers,
    )
    assert delete_contract_response.status_code == 204

    logs_response = client.get(
        f"/api/v1/projects/{project_id}/activity-logs",
        headers=auth_headers,
    )
    assert logs_response.status_code == 200
    descriptions = [log["description"] for log in logs_response.json()["data"]]

    assert 'Deleted draft "delete-v1" from "Delete MSA"' in descriptions
    assert 'Deleted contract "Delete MSA"' in descriptions


def test_project_activity_logs_require_project_membership(client, register_user):
    owner = register_user(email="activity-owner@example.com")
    outsider = register_user(email="activity-outsider@example.com")

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Private Activity", "description": "Owner only"},
        headers=owner["headers"],
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    response = client.get(
        f"/api/v1/projects/{project_id}/activity-logs",
        headers=outsider["headers"],
    )

    assert response.status_code == 404
