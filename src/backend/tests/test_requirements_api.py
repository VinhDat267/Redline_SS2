def test_requirement_crud_flow(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Requirement Demo", "description": "Requirement parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "SRS",
            "document_type": "SRS",
            "description": "Requirement parent doc",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={
            "document_id": document_id,
            "requirement_code": "REQ-RV-02",
            "title": "Review workflow must support comment confirmation",
            "description": "Short requirement description",
            "source_section": "Section 4.2",
        },
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    created_requirement = create_response.json()["data"]
    requirement_id = created_requirement["id"]
    assert created_requirement["requirement_code"] == "REQ-RV-02"

    list_response = client.get(f"/api/v1/projects/{project_id}/requirements", headers=auth_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    detail_response = client.get(f"/api/v1/requirements/{requirement_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["document_id"] == document_id

    update_response = client.patch(
        f"/api/v1/requirements/{requirement_id}",
        json={"title": "Updated requirement title", "status": "approved"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["status"] == "approved"

    delete_response = client.delete(f"/api/v1/requirements/{requirement_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/requirements/{requirement_id}", headers=auth_headers)
    assert missing_response.status_code == 404


def test_requirement_routes_require_project_membership(client, auth_headers, register_user):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Requirement Access Demo", "description": "Membership enforcement"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]
    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Protected Requirement Doc",
            "document_type": "SRS",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={
            "document_id": document_id,
            "requirement_code": "REQ-LOCKED-01",
            "title": "Protected requirement",
        },
        headers=auth_headers,
    )
    requirement_id = create_response.json()["data"]["id"]

    outsider = register_user(email="req-outsider@example.com", display_name="Req Outsider")

    list_response = client.get(
        f"/api/v1/projects/{project_id}/requirements",
        headers=outsider["headers"],
    )
    assert list_response.status_code == 404

    detail_response = client.get(f"/api/v1/requirements/{requirement_id}", headers=outsider["headers"])
    assert detail_response.status_code == 404
