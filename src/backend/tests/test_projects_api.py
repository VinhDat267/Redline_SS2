def test_project_crud_flow(client, auth_headers):
    create_response = client.post(
        "/api/v1/projects",
        json={"name": "Redline SS2 Demo", "description": "Current demo workspace"},
        headers=auth_headers,
    )

    assert create_response.status_code == 201
    created_project = create_response.json()["data"]
    assert created_project["name"] == "Redline SS2 Demo"
    project_id = created_project["id"]

    list_response = client.get("/api/v1/projects", headers=auth_headers)
    assert list_response.status_code == 200
    assert any(project["id"] == project_id for project in list_response.json()["data"])

    detail_response = client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["description"] == "Current demo workspace"

    update_response = client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Redline SS2 Review Workspace", "description": "SQLite-first demo baseline"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["name"] == "Redline SS2 Review Workspace"

    delete_response = client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert missing_response.status_code == 404


def test_project_member_crud_flow(client, seeded_users, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Review Workspace", "description": "Members demo"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    add_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": seeded_users[0].id, "role": "owner"},
        headers=auth_headers,
    )
    assert add_response.status_code == 201
    member_payload = add_response.json()["data"]
    assert member_payload["result_type"] == "member_added"
    assert member_payload["member"]["role"] == "owner"
    assert member_payload["invitation"] is None
    member_id = member_payload["member"]["id"]

    list_response = client.get(f"/api/v1/projects/{project_id}/members", headers=auth_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 2

    update_response = client.patch(
        f"/api/v1/projects/{project_id}/members/{member_id}",
        json={"role": "reviewer"},
        headers=auth_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["role"] == "reviewer"

    delete_response = client.delete(
        f"/api/v1/projects/{project_id}/members/{member_id}",
        headers=auth_headers,
    )
    assert delete_response.status_code == 204

    list_after_delete = client.get(f"/api/v1/projects/{project_id}/members", headers=auth_headers)
    assert list_after_delete.status_code == 200
    remaining_members = list_after_delete.json()["data"]
    assert len(remaining_members) == 1
    assert remaining_members[0]["role"] == "owner"


def test_projects_are_scoped_to_membership_and_creator_is_added_as_owner(client, auth_headers, register_user):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Scoped Project", "description": "Authorization coverage"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    me_response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me_response.status_code == 200
    creator_user_id = me_response.json()["data"]["id"]

    members_response = client.get(f"/api/v1/projects/{project_id}/members", headers=auth_headers)
    assert members_response.status_code == 200
    payload = members_response.json()["data"]
    assert len(payload) == 1
    assert payload[0]["project_id"] == project_id
    assert payload[0]["user_id"] == creator_user_id
    assert payload[0]["role"] == "owner"
    assert payload[0]["user_display_name"] == "Week 7 Tester"
    assert payload[0]["user_email"] == "week7@example.com"

    outsider = register_user(email="outsider@example.com", display_name="Outsider")

    outsider_list_response = client.get("/api/v1/projects", headers=outsider["headers"])
    assert outsider_list_response.status_code == 200
    assert outsider_list_response.json()["data"] == []

    outsider_detail_response = client.get(f"/api/v1/projects/{project_id}", headers=outsider["headers"])
    assert outsider_detail_response.status_code == 404

    outsider_members_response = client.get(
        f"/api/v1/projects/{project_id}/members",
        headers=outsider["headers"],
    )
    assert outsider_members_response.status_code == 404

    add_member_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": outsider["user"]["id"], "role": "reviewer"},
        headers=auth_headers,
    )
    assert add_member_response.status_code == 201
    assert add_member_response.json()["data"]["result_type"] == "member_added"

    outsider_list_after_join = client.get("/api/v1/projects", headers=outsider["headers"])
    assert outsider_list_after_join.status_code == 200
    assert [project["id"] for project in outsider_list_after_join.json()["data"]] == [project_id]


def test_project_members_without_owner_role_cannot_manage_project_or_members(client, auth_headers, register_user):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Role Boundary", "description": "Only owners can administer"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    reviewer = register_user(email="reviewer@example.com", display_name="Reviewer")
    other_user = register_user(email="other@example.com", display_name="Other User")

    reviewer_member_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": reviewer["user"]["id"], "role": "reviewer"},
        headers=auth_headers,
    )
    assert reviewer_member_response.status_code == 201
    reviewer_member_id = reviewer_member_response.json()["data"]["member"]["id"]

    invite_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_email": "pending-reviewer@example.com", "role": "reviewer"},
        headers=auth_headers,
    )
    assert invite_response.status_code == 201
    invitation_id = invite_response.json()["data"]["invitation"]["id"]

    update_project_response = client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Reviewer Rename"},
        headers=reviewer["headers"],
    )
    assert update_project_response.status_code == 403

    delete_project_response = client.delete(f"/api/v1/projects/{project_id}", headers=reviewer["headers"])
    assert delete_project_response.status_code == 403

    create_member_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": other_user["user"]["id"], "role": "reviewer"},
        headers=reviewer["headers"],
    )
    assert create_member_response.status_code == 403

    update_member_response = client.patch(
        f"/api/v1/projects/{project_id}/members/{reviewer_member_id}",
        json={"role": "owner"},
        headers=reviewer["headers"],
    )
    assert update_member_response.status_code == 403

    delete_member_response = client.delete(
        f"/api/v1/projects/{project_id}/members/{reviewer_member_id}",
        headers=reviewer["headers"],
    )
    assert delete_member_response.status_code == 403

    revoke_invitation_response = client.delete(
        f"/api/v1/projects/{project_id}/invitations/{invitation_id}",
        headers=reviewer["headers"],
    )
    assert revoke_invitation_response.status_code == 403


def test_project_membership_keeps_at_least_one_owner(client, auth_headers, register_user):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Owner Guard", "description": "Owner role cannot disappear"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    members_response = client.get(f"/api/v1/projects/{project_id}/members", headers=auth_headers)
    assert members_response.status_code == 200
    owner_member_id = members_response.json()["data"][0]["id"]

    demote_response = client.patch(
        f"/api/v1/projects/{project_id}/members/{owner_member_id}",
        json={"role": "reviewer"},
        headers=auth_headers,
    )
    assert demote_response.status_code == 409

    delete_response = client.delete(
        f"/api/v1/projects/{project_id}/members/{owner_member_id}",
        headers=auth_headers,
    )
    assert delete_response.status_code == 409

    co_owner = register_user(email="co-owner@example.com", display_name="Co Owner")
    add_owner_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": co_owner["user"]["id"], "role": "owner"},
        headers=auth_headers,
    )
    assert add_owner_response.status_code == 201

    delete_with_replacement_response = client.delete(
        f"/api/v1/projects/{project_id}/members/{owner_member_id}",
        headers=auth_headers,
    )
    assert delete_with_replacement_response.status_code == 204


def test_create_project_member_creates_pending_invitation_for_unverified_email(
    client,
    auth_headers,
    monkeypatch,
    register_user,
):
    from app.services import auth as auth_service

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Invite Scope", "description": "Registered users only"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    invite_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={
            "user_email": "future-user@example.com",
            "user_display_name": "Future User",
            "role": "reviewer",
        },
        headers=auth_headers,
    )
    assert invite_response.status_code == 201
    invite_payload = invite_response.json()["data"]
    assert invite_payload["result_type"] == "invitation_created"
    assert invite_payload["member"] is None
    assert invite_payload["invitation"]["email"] == "future-user@example.com"
    assert invite_payload["invitation"]["status"] == "pending"

    list_invitations_response = client.get(
        f"/api/v1/projects/{project_id}/invitations",
        headers=auth_headers,
    )
    assert list_invitations_response.status_code == 200
    invitations = list_invitations_response.json()["data"]
    assert len(invitations) == 1
    invitation_id = invitations[0]["id"]
    assert invitations[0]["email"] == "future-user@example.com"

    unverified_user = register_user(email="existing-reviewer@example.com", display_name="Existing Reviewer")

    add_unverified_user_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={
            "user_email": unverified_user["user"]["email"],
            "role": "reviewer",
        },
        headers=auth_headers,
    )
    assert add_unverified_user_response.status_code == 201
    unverified_user_payload = add_unverified_user_response.json()["data"]
    assert unverified_user_payload["result_type"] == "invitation_created"
    assert unverified_user_payload["member"] is None
    assert unverified_user_payload["invitation"]["email"] == "existing-reviewer@example.com"
    unverified_invitation_id = unverified_user_payload["invitation"]["id"]

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-existing-reviewer",
            "email": "verified-reviewer@example.com",
            "email_verified": True,
            "name": "Verified Reviewer",
        },
        raising=False,
    )
    known_user_response = client.post("/api/v1/auth/google", json={"credential": "valid-token"})
    assert known_user_response.status_code == 200
    known_user = known_user_response.json()["data"]["user"]

    add_known_user_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={
            "user_email": known_user["email"],
            "role": "reviewer",
        },
        headers=auth_headers,
    )
    assert add_known_user_response.status_code == 201
    known_user_payload = add_known_user_response.json()["data"]
    assert known_user_payload["result_type"] == "member_added"
    assert known_user_payload["member"]["user_email"] == "verified-reviewer@example.com"
    assert known_user_payload["invitation"] is None

    revoke_response = client.delete(
        f"/api/v1/projects/{project_id}/invitations/{invitation_id}",
        headers=auth_headers,
    )
    assert revoke_response.status_code == 204

    list_after_revoke_response = client.get(
        f"/api/v1/projects/{project_id}/invitations",
        headers=auth_headers,
    )
    assert list_after_revoke_response.status_code == 200
    assert [
        invitation["id"] for invitation in list_after_revoke_response.json()["data"]
    ] == [unverified_invitation_id]
