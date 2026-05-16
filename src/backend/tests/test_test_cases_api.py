def test_test_case_crud_flow(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Test Case Demo", "description": "Test case parent"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/projects/{project_id}/test-cases",
        json={
            "test_case_code": "TC-RV-05",
            "title": "Confirm review comment persistence",
            "description": "Short test case description",
            "priority": "high",
            "status": "ready",
        },
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    created_test_case = create_response.json()["data"]
    test_case_id = created_test_case["id"]
    assert created_test_case["test_case_code"] == "TC-RV-05"

    list_response = client.get(f"/api/v1/projects/{project_id}/test-cases", headers=auth_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1

    detail_response = client.get(f"/api/v1/test-cases/{test_case_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["priority"] == "high"

    update_response = client.patch(
        f"/api/v1/test-cases/{test_case_id}",
        json={"status": "implemented", "title": "Updated test title"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["status"] == "implemented"

    delete_response = client.delete(f"/api/v1/test-cases/{test_case_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/test-cases/{test_case_id}", headers=auth_headers)
    assert missing_response.status_code == 404


def test_test_case_routes_require_project_membership(client, auth_headers, register_user):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Test Case Access Demo", "description": "Membership enforcement"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/projects/{project_id}/test-cases",
        json={
            "test_case_code": "TC-LOCKED-01",
            "title": "Protected test case",
        },
        headers=auth_headers,
    )
    test_case_id = create_response.json()["data"]["id"]

    outsider = register_user(email="tc-outsider@example.com", display_name="TC Outsider")

    list_response = client.get(
        f"/api/v1/projects/{project_id}/test-cases",
        headers=outsider["headers"],
    )
    assert list_response.status_code == 404

    detail_response = client.get(f"/api/v1/test-cases/{test_case_id}", headers=outsider["headers"])
    assert detail_response.status_code == 404
