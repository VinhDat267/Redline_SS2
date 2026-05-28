def test_register_login_and_session_flow(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "display_name": "Owner",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201
    register_payload = register_response.json()["data"]
    assert register_payload["user"]["email"] == "owner@example.com"
    assert "token" not in register_payload
    assert register_payload["csrf_token"]
    assert register_payload["pending_project_invitations"] == []
    set_cookie_header = register_response.headers["set-cookie"]
    assert "redline_session=" in set_cookie_header
    assert "HttpOnly" in set_cookie_header
    assert "SameSite=lax" in set_cookie_header

    me_response = client.get("/api/v1/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["data"]["display_name"] == "Owner"

    missing_csrf_response = client.patch("/api/v1/auth/me", json={"display_name": "No CSRF"})
    assert missing_csrf_response.status_code == 403
    assert missing_csrf_response.json()["detail"] == "Your session has expired. Please sign in again."

    csrf_profile_response = client.patch(
        "/api/v1/auth/me",
        headers={"X-CSRF-Token": register_payload["csrf_token"]},
        json={"display_name": "Owner Cookie"},
    )
    assert csrf_profile_response.status_code == 200
    assert csrf_profile_response.json()["data"]["display_name"] == "Owner Cookie"

    duplicate_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "display_name": "Owner",
            "password": "redline123",
        },
    )
    assert duplicate_response.status_code == 409

    client.cookies.clear()
    unauthorized_projects = client.get("/api/v1/projects")
    assert unauthorized_projects.status_code == 401

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "redline123"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["data"]["user"]["display_name"] == "Owner Cookie"
    assert "token" not in login_response.json()["data"]
    assert login_response.json()["data"]["csrf_token"]
    assert login_response.json()["data"]["pending_project_invitations"] == []


def test_logout_requires_csrf_and_clears_auth_cookie(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "logout@example.com",
            "display_name": "Logout User",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201
    csrf_token = register_response.json()["data"]["csrf_token"]

    missing_csrf_response = client.post("/api/v1/auth/logout")
    assert missing_csrf_response.status_code == 403

    logout_response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf_token})
    assert logout_response.status_code == 204
    assert "redline_session=" in logout_response.headers["set-cookie"]
    assert "Max-Age=0" in logout_response.headers["set-cookie"]

    me_response = client.get("/api/v1/auth/me")
    assert me_response.status_code == 401


def test_malformed_bearer_token_returns_unauthorized(app):
    from fastapi.testclient import TestClient

    safe_client = TestClient(app, raise_server_exceptions=False)

    response = safe_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer abc.a"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Your session has expired. Please sign in again."


def test_password_change_revokes_existing_session_token(client):
    from app.core.security import create_access_token

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "revoke-token@example.com",
            "display_name": "Revoke Token",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201
    register_payload = register_response.json()["data"]
    original_token = create_access_token(register_payload["user"]["id"], token_version=0)

    password_response = client.post(
        "/api/v1/auth/me/password",
        headers={"Authorization": f"Bearer {original_token}"},
        json={"current_password": "redline123", "new_password": "newpass123"},
    )
    assert password_response.status_code == 200

    revoked_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {original_token}"},
    )

    assert revoked_response.status_code == 401
    assert revoked_response.json()["detail"] == "Your session has expired. Please sign in again."

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "revoke-token@example.com", "password": "newpass123"},
    )
    assert login_response.status_code == 200

    assert client.get("/api/v1/auth/me").status_code == 200


def test_register_rejects_invalid_or_oversized_email(client):
    invalid_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "not-an-email",
            "display_name": "Invalid Email",
            "password": "redline123",
        },
    )
    oversized_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{'a' * 250}@example.com",
            "display_name": "Oversized Email",
            "password": "redline123",
        },
    )

    assert invalid_response.status_code == 422
    assert oversized_response.status_code == 422


def test_register_rate_limits_by_ip_and_email(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "auth_register_rate_limit_max_attempts", 2, raising=False)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)

    for index in range(2):
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": f"register-limit-{index}@example.com",
                "display_name": "Register Limited",
                "password": "redline123",
            },
        )
        assert response.status_code == 201

    limited_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "register-limit-3@example.com",
            "display_name": "Register Limited",
            "password": "redline123",
        },
    )

    assert limited_response.status_code == 429
    assert limited_response.headers["retry-after"].isdigit()
    assert limited_response.json()["detail"] == "Too many authentication attempts. Try again later."


def test_google_login_creates_google_only_user(client, monkeypatch):
    from app.services import auth as auth_service

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-1",
            "email": "google-user@example.com",
            "email_verified": True,
            "name": "Google User",
        },
        raising=False,
    )

    response = client.post("/api/v1/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["user"]["email"] == "google-user@example.com"
    assert payload["user"]["display_name"] == "Google User"
    assert payload["user"]["has_password"] is False
    assert payload["user"]["google_linked"] is True

    password_response = client.post(
        "/api/v1/auth/login",
        json={"email": "google-user@example.com", "password": "redline123"},
    )
    assert password_response.status_code == 401


def test_google_login_rejects_oversized_credential(client):
    response = client.post("/api/v1/auth/google", json={"credential": "x" * 8193})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "credential"]
    assert response.json()["detail"][0]["type"] == "string_too_long"


def test_google_credential_verification_has_requests_transport(monkeypatch):
    from app.core.config import settings
    from app.services import auth as auth_service
    from google.oauth2 import id_token

    observed = {}

    def fake_verify_oauth2_token(credential, request, audience):
        observed["credential"] = credential
        observed["request_type"] = type(request).__name__
        observed["audience"] = audience
        return {
            "iss": "accounts.google.com",
            "sub": "google-sub-transport",
            "email": "transport@example.com",
            "email_verified": True,
        }

    monkeypatch.setattr(settings, "google_client_id", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(id_token, "verify_oauth2_token", fake_verify_oauth2_token)

    claims = auth_service.verify_google_credential("valid-token")

    assert claims["sub"] == "google-sub-transport"
    assert observed == {
        "credential": "valid-token",
        "request_type": "Request",
        "audience": "client-id.apps.googleusercontent.com",
    }


def test_google_credential_transport_error_returns_service_unavailable(monkeypatch):
    import pytest
    from fastapi import HTTPException

    from app.core.config import settings
    from app.services import auth as auth_service
    from google.auth import exceptions as google_auth_exceptions
    from google.oauth2 import id_token

    def fake_verify_oauth2_token(credential, request, audience):
        raise google_auth_exceptions.TransportError("Google cert fetch failed")

    monkeypatch.setattr(settings, "google_client_id", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(id_token, "verify_oauth2_token", fake_verify_oauth2_token)

    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_google_credential("valid-token")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Google login is temporarily unavailable"


def test_google_credential_google_auth_error_returns_invalid_credential(monkeypatch):
    import pytest
    from fastapi import HTTPException

    from app.core.config import settings
    from app.services import auth as auth_service
    from google.auth import exceptions as google_auth_exceptions
    from google.oauth2 import id_token

    def fake_verify_oauth2_token(credential, request, audience):
        raise google_auth_exceptions.GoogleAuthError("Wrong issuer")

    monkeypatch.setattr(settings, "google_client_id", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(id_token, "verify_oauth2_token", fake_verify_oauth2_token)

    with pytest.raises(HTTPException) as exc_info:
        auth_service.verify_google_credential("valid-token")

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid Google credential"


def test_google_login_links_existing_local_user_by_verified_email(client, monkeypatch):
    from app.services import auth as auth_service

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "link-me@example.com",
            "display_name": "Local Name",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-link",
            "email": "link-me@example.com",
            "email_verified": True,
            "name": "Google Name",
        },
        raising=False,
    )

    response = client.post("/api/v1/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["user"]["display_name"] == "Local Name"
    assert payload["user"]["has_password"] is True
    assert payload["user"]["google_linked"] is True


def test_google_login_rejects_unverified_email(client, monkeypatch):
    from app.services import auth as auth_service

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-unverified",
            "email": "unverified@example.com",
            "email_verified": False,
            "name": "Unverified User",
        },
        raising=False,
    )

    response = client.post("/api/v1/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 401


def test_google_login_rejects_subject_mismatch(client, monkeypatch):
    from app.services import auth as auth_service

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-original",
            "email": "linked@example.com",
            "email_verified": True,
            "name": "Linked User",
        },
        raising=False,
    )
    assert client.post("/api/v1/auth/google", json={"credential": "first"}).status_code == 200

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-different",
            "email": "linked@example.com",
            "email_verified": True,
            "name": "Linked User",
        },
        raising=False,
    )

    response = client.post("/api/v1/auth/google", json={"credential": "second"})

    assert response.status_code == 409


def test_password_login_rate_limits_by_ip_and_email(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "auth_login_rate_limit_max_attempts", 2, raising=False)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "rate-limit@example.com",
            "display_name": "Rate Limited",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201

    for _ in range(2):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "rate-limit@example.com", "password": "wrongpass123"},
        )
        assert response.status_code == 401

    limited_response = client.post(
        "/api/v1/auth/login",
        json={"email": "rate-limit@example.com", "password": "wrongpass123"},
    )

    assert limited_response.status_code == 429
    assert limited_response.headers["retry-after"].isdigit()
    assert limited_response.json()["detail"] == "Too many authentication attempts. Try again later."


def test_password_login_rate_limits_same_email_across_ips(app, monkeypatch):
    from fastapi.testclient import TestClient

    from app.core.config import settings

    monkeypatch.setattr(settings, "auth_login_rate_limit_max_attempts", 2, raising=False)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)

    first_client = TestClient(app, client=("198.51.100.10", 50000))
    second_client = TestClient(app, client=("198.51.100.11", 50000))
    third_client = TestClient(app, client=("198.51.100.12", 50000))

    register_response = first_client.post(
        "/api/v1/auth/register",
        json={
            "email": "email-bucket@example.com",
            "display_name": "Email Bucket",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201

    assert (
        first_client.post(
            "/api/v1/auth/login",
            json={"email": "email-bucket@example.com", "password": "wrongpass123"},
        ).status_code
        == 401
    )
    assert (
        second_client.post(
            "/api/v1/auth/login",
            json={"email": "email-bucket@example.com", "password": "wrongpass123"},
        ).status_code
        == 401
    )

    limited_response = third_client.post(
        "/api/v1/auth/login",
        json={"email": "email-bucket@example.com", "password": "wrongpass123"},
    )

    assert limited_response.status_code == 429


def test_password_login_rate_limits_same_ip_across_emails(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "auth_login_rate_limit_max_attempts", 2, raising=False)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)

    assert client.post(
        "/api/v1/auth/login",
        json={"email": "first-ip-bucket@example.com", "password": "wrongpass123"},
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"email": "second-ip-bucket@example.com", "password": "wrongpass123"},
    ).status_code == 401

    limited_response = client.post(
        "/api/v1/auth/login",
        json={"email": "third-ip-bucket@example.com", "password": "wrongpass123"},
    )

    assert limited_response.status_code == 429


def test_password_login_rate_limit_is_shared_across_database_sessions(session_factory, monkeypatch):
    import pytest
    from fastapi import HTTPException

    from app.core.config import settings
    from app.services.auth_rate_limit import enforce_password_login_rate_limit

    monkeypatch.setattr(settings, "auth_login_rate_limit_max_attempts", 2, raising=False)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)

    with session_factory() as first_session:
        enforce_password_login_rate_limit(first_session, "198.51.100.25", "shared-limit@example.com")
    with session_factory() as second_session:
        enforce_password_login_rate_limit(second_session, "198.51.100.26", "shared-limit@example.com")

    with session_factory() as third_session:
        with pytest.raises(HTTPException) as exc_info:
            enforce_password_login_rate_limit(third_session, "198.51.100.27", "shared-limit@example.com")

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Retry-After"].isdigit()


def test_auth_rate_limit_email_buckets_do_not_store_plaintext_emails(session_factory, monkeypatch):
    from sqlalchemy import select

    from app.core.config import settings
    from app.models.auth_rate_limit_bucket import AuthRateLimitBucket
    from app.services.auth_rate_limit import (
        enforce_password_login_rate_limit,
        enforce_register_rate_limit,
    )

    monkeypatch.setattr(settings, "auth_secret", "test-secret-for-email-rate-limit-hmac", raising=False)
    sensitive_email = "Sensitive.User+Label@Example.com"
    normalized_email = "sensitive.user+label@example.com"

    with session_factory() as session:
        enforce_password_login_rate_limit(session, "198.51.100.30", sensitive_email)
        enforce_register_rate_limit(session, "198.51.100.31", sensitive_email)

        bucket_keys = session.scalars(
            select(AuthRateLimitBucket.bucket_key).order_by(AuthRateLimitBucket.bucket_key)
        ).all()

    assert all(sensitive_email not in key for key in bucket_keys)
    assert all(normalized_email not in key for key in bucket_keys)
    assert any(key.startswith("auth:login:email-hmac-sha256:") for key in bucket_keys)
    assert any(key.startswith("auth:register:email-hmac-sha256:") for key in bucket_keys)


def test_google_login_rate_limit_runs_before_token_verification(client, monkeypatch):
    from app.core.config import settings
    from app.services import auth as auth_service

    observed_credentials = []

    def fake_verify_google_credential(credential):
        observed_credentials.append(credential)
        return {
            "sub": "google-sub-rate-limit",
            "email": "google-rate-limit@example.com",
            "email_verified": True,
            "name": "Google Rate Limit",
        }

    monkeypatch.setattr(settings, "auth_google_rate_limit_max_attempts", 2, raising=False)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)
    monkeypatch.setattr(auth_service, "verify_google_credential", fake_verify_google_credential)

    assert client.post("/api/v1/auth/google", json={"credential": "token-1"}).status_code == 200
    assert client.post("/api/v1/auth/google", json={"credential": "token-2"}).status_code == 200

    limited_response = client.post("/api/v1/auth/google", json={"credential": "token-3"})

    assert limited_response.status_code == 429
    assert limited_response.headers["retry-after"].isdigit()
    assert observed_credentials == ["token-1", "token-2"]


def test_current_user_profile_update_and_password_change(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "profile@example.com",
            "display_name": "Profile User",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201
    csrf_token = register_response.json()["data"]["csrf_token"]
    headers = {"X-CSRF-Token": csrf_token}

    profile_response = client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"display_name": "Updated Profile"},
    )
    assert profile_response.status_code == 200
    assert profile_response.json()["data"]["display_name"] == "Updated Profile"

    wrong_password_response = client.post(
        "/api/v1/auth/me/password",
        headers=headers,
        json={"current_password": "wrongpass123", "new_password": "newpass123"},
    )
    assert wrong_password_response.status_code == 401

    password_response = client.post(
        "/api/v1/auth/me/password",
        headers=headers,
        json={"current_password": "redline123", "new_password": "newpass123"},
    )
    assert password_response.status_code == 200
    assert password_response.json()["data"]["csrf_token"]

    assert client.post(
        "/api/v1/auth/login",
        json={"email": "profile@example.com", "password": "redline123"},
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"email": "profile@example.com", "password": "newpass123"},
    ).status_code == 200


def test_password_change_rate_limits_current_password_attempts(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "auth_password_change_rate_limit_max_attempts", 2, raising=False)
    monkeypatch.setattr(settings, "auth_rate_limit_window_seconds", 60, raising=False)

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "password-change-limit@example.com",
            "display_name": "Password Change Limit",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201
    headers = {"X-CSRF-Token": register_response.json()["data"]["csrf_token"]}

    for index in range(2):
        response = client.post(
            "/api/v1/auth/me/password",
            headers=headers,
            json={"current_password": f"wrongpass12{index}", "new_password": "newpass123"},
        )
        assert response.status_code == 401

    limited_response = client.post(
        "/api/v1/auth/me/password",
        headers=headers,
        json={"current_password": "wrongpass999", "new_password": "newpass123"},
    )

    assert limited_response.status_code == 429
    assert limited_response.headers["retry-after"].isdigit()
    assert limited_response.json()["detail"] == "Too many authentication attempts. Try again later."


def test_password_change_rejects_google_only_account(client, monkeypatch):
    from app.services import auth as auth_service

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-passwordless",
            "email": "passwordless@example.com",
            "email_verified": True,
            "name": "Passwordless User",
        },
        raising=False,
    )
    login_response = client.post("/api/v1/auth/google", json={"credential": "valid-token"})
    assert login_response.status_code == 200
    csrf_token = login_response.json()["data"]["csrf_token"]

    response = client.post(
        "/api/v1/auth/me/password",
        headers={"X-CSRF-Token": csrf_token},
        json={"current_password": "redline123", "new_password": "newpass123"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Password sign-in is not enabled for this account"


def test_google_login_surfaces_pending_project_invitations_until_acceptance(client, auth_headers, monkeypatch):
    from app.services import auth as auth_service

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Invited Project", "description": "Invitation acceptance flow"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    invite_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={
            "user_email": "invitee@example.com",
            "user_display_name": "Invitee",
            "role": "reviewer",
        },
        headers=auth_headers,
    )
    assert invite_response.status_code == 201
    invitation_id = invite_response.json()["data"]["invitation"]["id"]

    monkeypatch.setattr(
        auth_service,
        "verify_google_credential",
        lambda credential: {
            "sub": "google-sub-invitee",
            "email": "invitee@example.com",
            "email_verified": True,
            "name": "Invitee",
        },
        raising=False,
    )

    login_response = client.post("/api/v1/auth/google", json={"credential": "valid-token"})
    assert login_response.status_code == 200
    login_payload = login_response.json()["data"]
    assert len(login_payload["pending_project_invitations"]) == 1
    assert login_payload["pending_project_invitations"][0]["id"] == invitation_id

    accept_response = client.post(
        f"/api/v1/auth/project-invitations/{invitation_id}/accept",
        headers={"X-CSRF-Token": login_payload["csrf_token"]},
    )
    assert accept_response.status_code == 200
    acceptance_payload = accept_response.json()["data"]
    assert acceptance_payload["member"]["project_id"] == project_id
    assert acceptance_payload["member"]["role"] == "reviewer"
    assert acceptance_payload["pending_project_invitations"] == []

    project_list_response = client.get("/api/v1/projects")
    assert project_list_response.status_code == 200
    assert [project["id"] for project in project_list_response.json()["data"]] == [project_id]


def test_local_password_account_can_claim_pending_project_invitation_by_email(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Protected Invitation", "description": "Invitation verification"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    invite_response = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={
            "user_email": "unverified-invitee@example.com",
            "user_display_name": "Unverified Invitee",
            "role": "reviewer",
        },
        headers=auth_headers,
    )
    assert invite_response.status_code == 201
    invitation_id = invite_response.json()["data"]["invitation"]["id"]

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "unverified-invitee@example.com",
            "display_name": "Unverified Invitee",
            "password": "redline123",
        },
    )
    assert register_response.status_code == 201
    register_payload = register_response.json()["data"]
    assert len(register_payload["pending_project_invitations"]) == 1
    assert register_payload["pending_project_invitations"][0]["id"] == invitation_id

    accept_response = client.post(
        f"/api/v1/auth/project-invitations/{invitation_id}/accept",
        headers={"X-CSRF-Token": register_payload["csrf_token"]},
    )

    assert accept_response.status_code == 200


def test_demo_seed_creates_live_workspace_data(client, auth_headers):
    first_seed_response = client.post("/api/v1/demo/seed", headers=auth_headers)
    assert first_seed_response.status_code == 200
    first_seed_payload = first_seed_response.json()["data"]

    project_id = first_seed_payload["project"]["id"]
    assert first_seed_payload["documents_seeded"] >= 1
    assert first_seed_payload["versions_seeded"] >= 2

    project_list_response = client.get("/api/v1/projects", headers=auth_headers)
    assert project_list_response.status_code == 200
    assert len(project_list_response.json()["data"]) == 1

    documents_response = client.get(f"/api/v1/projects/{project_id}/documents", headers=auth_headers)
    assert documents_response.status_code == 200
    documents = documents_response.json()["data"]
    assert len(documents) >= 1
    assert first_seed_payload["project"]["document_count"] == len(documents)

    versions_response = client.get(
        f"/api/v1/documents/{documents[0]['id']}/versions",
        headers=auth_headers,
    )
    assert versions_response.status_code == 200
    assert len(versions_response.json()["data"]) >= 2

    second_seed_response = client.post("/api/v1/demo/seed", headers=auth_headers)
    assert second_seed_response.status_code == 200

    project_list_after_second_seed = client.get("/api/v1/projects", headers=auth_headers)
    assert project_list_after_second_seed.status_code == 200
    assert len(project_list_after_second_seed.json()["data"]) == 1


def test_demo_seed_creates_user_scoped_workspace_without_cross_tenant_access(client, auth_headers, register_user):
    first_seed_response = client.post("/api/v1/demo/seed", headers=auth_headers)
    assert first_seed_response.status_code == 200
    first_project_id = first_seed_response.json()["data"]["project"]["id"]

    outsider = register_user(email="demo-outsider@example.com", display_name="Demo Outsider")
    outsider_before_seed = client.get(
        f"/api/v1/projects/{first_project_id}/documents",
        headers=outsider["headers"],
    )
    assert outsider_before_seed.status_code == 404

    outsider_seed_response = client.post("/api/v1/demo/seed", headers=outsider["headers"])
    assert outsider_seed_response.status_code == 200
    outsider_project_id = outsider_seed_response.json()["data"]["project"]["id"]

    assert outsider_project_id != first_project_id
    outsider_after_seed = client.get(
        f"/api/v1/projects/{first_project_id}/documents",
        headers=outsider["headers"],
    )
    assert outsider_after_seed.status_code == 404
    outsider_own_documents = client.get(
        f"/api/v1/projects/{outsider_project_id}/documents",
        headers=outsider["headers"],
    )
    assert outsider_own_documents.status_code == 200


def test_demo_seed_does_not_reset_existing_demo_account_password(client, auth_headers):
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "vinh@example.com",
            "display_name": "Real Vinh",
            "password": "privatepass123",
        },
    )
    assert register_response.status_code == 201
    client.cookies.clear()

    assert client.post(
        "/api/v1/auth/login",
        json={"email": "vinh@example.com", "password": "privatepass123"},
    ).status_code == 200
    client.cookies.clear()
    assert client.post(
        "/api/v1/auth/login",
        json={"email": "vinh@example.com", "password": "redline123"},
    ).status_code == 401
    client.cookies.clear()

    seed_response = client.post("/api/v1/demo/seed", headers=auth_headers)
    assert seed_response.status_code == 200

    assert client.post(
        "/api/v1/auth/login",
        json={"email": "vinh@example.com", "password": "privatepass123"},
    ).status_code == 200
    client.cookies.clear()
    assert client.post(
        "/api/v1/auth/login",
        json={"email": "vinh@example.com", "password": "redline123"},
    ).status_code == 401


def test_decline_missing_project_invitation_returns_not_found(client, auth_headers):
    response = client.post("/api/v1/auth/project-invitations/999999/decline", headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Project invitation not found"


def test_auth_routes_allow_localhost_cors_preflight(client):
    response = client.options(
        "/api/v1/auth/register",
        headers={
            "Origin": "http://127.0.0.1:4183",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4183"


def test_auth_routes_allow_ipv6_localhost_cors_preflight(client):
    response = client.options(
        "/api/v1/auth/google",
        headers={
            "Origin": "http://[::1]:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://[::1]:5173"


def test_auth_routes_allow_configured_deployed_frontend_cors_preflight(session_factory, monkeypatch):
    from fastapi.testclient import TestClient

    from app.core.config import settings
    from app.main import create_app

    monkeypatch.setattr(settings, "cors_origins", ("https://redline-production.vercel.app",), raising=False)
    monkeypatch.setattr(settings, "cors_origin_regex", None, raising=False)

    deployed_app = create_app(session_factory=session_factory, start_ai_worker=False)
    deployed_client = TestClient(deployed_app)

    response = deployed_client.options(
        "/api/v1/auth/google",
        headers={
            "Origin": "https://redline-production.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://redline-production.vercel.app"


def test_auth_routes_reject_shared_hosting_platform_cors_preflight(client):
    for origin in (
        "https://attacker.vercel.app",
        "https://attacker.herokuapp.com",
        "https://attacker.tech",
    ):
        response = client.options(
            "/api/v1/auth/google",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-csrf-token",
            },
        )

        assert response.status_code == 400
        assert "access-control-allow-origin" not in response.headers
