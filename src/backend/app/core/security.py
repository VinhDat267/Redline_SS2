import base64
import binascii
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Response

from app.core.config import settings


PBKDF2_ITERATIONS = 390_000
DEMO_PASSWORD = "redline123"
DEMO_PASSWORD_SALT = "redline-demo-password"
AUTH_SESSION_COOKIE_NAME = "redline_session"
AUTH_CSRF_HEADER_NAME = "X-CSRF-Token"


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: int
    token_version: int
    csrf_token: str | None = None


def _urlsafe_b64encode(raw_value: bytes) -> str:
    return base64.urlsafe_b64encode(raw_value).rstrip(b"=").decode("ascii")


def _urlsafe_b64decode(encoded_value: str) -> bytes:
    padding = "=" * (-len(encoded_value) % 4)
    return base64.urlsafe_b64decode(f"{encoded_value}{padding}")


def hash_password(password: str, *, salt: str | None = None) -> str:
    password_salt = salt or secrets.token_hex(16)
    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        password_salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${password_salt}${_urlsafe_b64encode(derived_key)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iteration_text, salt, stored_hash = password_hash.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    try:
        iterations = int(iteration_text)
    except ValueError:
        return False

    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return hmac.compare_digest(_urlsafe_b64encode(derived_key), stored_hash)


def build_demo_password_hash() -> str:
    return hash_password(DEMO_PASSWORD, salt=DEMO_PASSWORD_SALT)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def create_access_token(user_id: int, *, token_version: int = 0, csrf_token: str | None = None) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "exp": int(expires_at.timestamp()),
        "ver": token_version,
    }
    if csrf_token is not None:
        payload["csrf"] = csrf_token
    encoded_payload = _urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(
        settings.auth_secret.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_urlsafe_b64encode(signature)}"


def verify_access_token(token: str) -> AccessTokenClaims:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid access token") from exc

    expected_signature = hmac.new(
        settings.auth_secret.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    try:
        actual_signature = _urlsafe_b64decode(encoded_signature)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid access token") from exc

    if not hmac.compare_digest(actual_signature, expected_signature):
        raise ValueError("Invalid access token")

    try:
        payload = json.loads(_urlsafe_b64decode(encoded_payload))
    except (binascii.Error, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid access token") from exc

    exp = payload.get("exp")
    sub = payload.get("sub")
    token_version = payload.get("ver", 0)
    csrf_token = payload.get("csrf")
    if not isinstance(exp, int) or not isinstance(sub, str) or not isinstance(token_version, int):
        raise ValueError("Invalid access token")
    if csrf_token is not None and not isinstance(csrf_token, str):
        raise ValueError("Invalid access token")

    if datetime.now(UTC).timestamp() >= exp:
        raise ValueError("Access token has expired")

    try:
        user_id = int(sub)
    except ValueError as exc:
        raise ValueError("Invalid access token") from exc

    return AccessTokenClaims(user_id=user_id, token_version=token_version, csrf_token=csrf_token)


def set_auth_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.auth_cookie_secure_enabled,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )


def clear_auth_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_SESSION_COOKIE_NAME,
        secure=settings.auth_cookie_secure_enabled,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )
