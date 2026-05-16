def test_requirement_test_case_mapping_crud_flow(client, auth_headers):
    # Setup parent project and document
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Mapping Demo", "description": "Mapping parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={"title": "SRS mapping", "document_type": "SRS"},
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    # Setup requirement
    req_response = client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={
            "document_id": document_id,
            "requirement_code": "REQ-MAP-01",
            "title": "Mapping req title",
        },
        headers=auth_headers,
    )
    requirement_id = req_response.json()["data"]["id"]

    # Setup test case
    tc_response = client.post(
        f"/api/v1/projects/{project_id}/test-cases",
        json={
            "document_id": document_id,
            "test_case_code": "TC-MAP-01",
            "title": "Mapping tc title",
        },
        headers=auth_headers,
    )
    test_case_id = tc_response.json()["data"]["id"]

    # Create mapping
    mapping_response = client.post(
        f"/api/v1/requirements/{requirement_id}/test-case-mappings",
        json={
            "test_case_id": test_case_id,
            "notes": "Verified automatically"
        },
        headers=auth_headers,
    )
    assert mapping_response.status_code == 201
    mapping = mapping_response.json()["data"]
    assert mapping["requirement_id"] == requirement_id
    assert mapping["test_case_id"] == test_case_id
    assert mapping["notes"] == "Verified automatically"

    # List mappings
    list_response = client.get(
        f"/api/v1/requirements/{requirement_id}/test-case-mappings",
        headers=auth_headers,
    )
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    # Delete mapping
    delete_response = client.delete(
        f"/api/v1/requirements/{requirement_id}/test-case-mappings/{test_case_id}",
        headers=auth_headers,
    )
    assert delete_response.status_code == 204

    # Verify list is empty
    list_response_after = client.get(
        f"/api/v1/requirements/{requirement_id}/test-case-mappings",
        headers=auth_headers,
    )
    assert len(list_response_after.json()["data"]) == 0


def test_requirement_test_case_mapping_routes_require_project_membership(client, auth_headers, register_user):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Mapping Access Demo", "description": "Mapping access parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={"title": "Protected mapping doc", "document_type": "SRS"},
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    req_response = client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={
            "document_id": document_id,
            "requirement_code": "REQ-MAP-LOCKED",
            "title": "Locked requirement",
        },
        headers=auth_headers,
    )
    requirement_id = req_response.json()["data"]["id"]

    tc_response = client.post(
        f"/api/v1/projects/{project_id}/test-cases",
        json={
            "test_case_code": "TC-MAP-LOCKED",
            "title": "Locked test case",
        },
        headers=auth_headers,
    )
    test_case_id = tc_response.json()["data"]["id"]

    outsider = register_user(email="mapping-outsider@example.com", display_name="Mapping Outsider")

    list_response = client.get(
        f"/api/v1/requirements/{requirement_id}/test-case-mappings",
        headers=outsider["headers"],
    )
    assert list_response.status_code == 404

    create_response = client.post(
        f"/api/v1/requirements/{requirement_id}/test-case-mappings",
        json={"test_case_id": test_case_id},
        headers=outsider["headers"],
    )
    assert create_response.status_code == 404
