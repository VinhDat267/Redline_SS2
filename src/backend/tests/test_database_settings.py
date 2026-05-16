from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import BACKEND_ROOT, DEFAULT_AUTH_SECRET, DEFAULT_DATABASE_URL, Settings
from app.core.vector_config import EMBEDDING_DIMENSIONS
from app.models import DocumentBlock


def test_settings_env_file_is_backend_local_file():
    env_file = Settings.model_config["env_file"]

    assert Path(env_file).is_absolute()
    assert Path(env_file) == BACKEND_ROOT / ".env"


def test_relative_uploads_dir_resolves_under_backend_root():
    settings = Settings(uploads_dir="uploads")

    assert Path(settings.uploads_dir) == BACKEND_ROOT / "uploads"


def test_default_database_url_targets_local_postgres_pgvector_runtime():
    settings = Settings()

    assert DEFAULT_DATABASE_URL.startswith("postgresql+psycopg://")
    assert settings.database_url.startswith("postgresql+psycopg://")
    assert settings.is_sqlite is False


def test_default_auth_secret_is_allowed_for_local_development():
    settings = Settings(_env_file=None, environment="local", auth_secret=DEFAULT_AUTH_SECRET)

    assert settings.auth_secret == DEFAULT_AUTH_SECRET


def test_production_rejects_default_auth_secret():
    with pytest.raises(ValidationError, match="REDLINE_AUTH_SECRET"):
        Settings(_env_file=None, environment="production", auth_secret=DEFAULT_AUTH_SECRET)


def test_production_accepts_strong_auth_secret():
    settings = Settings(
        _env_file=None,
        environment="production",
        auth_secret="prod-secret-32-bytes-minimum-value",
        cors_origins=("https://redline-production.vercel.app",),
        upload_storage_backend="persistent-local",
    )

    assert settings.auth_secret == "prod-secret-32-bytes-minimum-value"


def test_auth_cookie_settings_are_normalized_and_secure_for_deploy():
    production_settings = Settings(
        _env_file=None,
        environment="production",
        auth_secret="prod-secret-32-bytes-minimum-value",
        cors_origins=("https://redline-production.vercel.app",),
        upload_storage_backend="persistent-local",
        auth_cookie_samesite="Strict",
    )
    local_settings = Settings(_env_file=None, environment="local")

    assert production_settings.auth_cookie_secure_enabled is True
    assert production_settings.auth_cookie_samesite == "strict"
    assert local_settings.auth_cookie_secure_enabled is False


def test_invalid_auth_cookie_samesite_is_rejected():
    with pytest.raises(ValidationError, match="REDLINE_AUTH_COOKIE_SAMESITE"):
        Settings(_env_file=None, auth_cookie_samesite="invalid")


def test_invalid_upload_storage_backend_is_rejected():
    with pytest.raises(ValidationError, match="REDLINE_UPLOAD_STORAGE_BACKEND"):
        Settings(_env_file=None, upload_storage_backend="s3")


def test_production_rejects_default_local_upload_storage():
    with pytest.raises(ValidationError, match="REDLINE_UPLOAD_STORAGE_BACKEND"):
        Settings(
            _env_file=None,
            environment="production",
            auth_secret="prod-secret-32-bytes-minimum-value",
            cors_origins=("https://redline-production.vercel.app",),
        )


def test_production_accepts_persistent_local_upload_storage():
    settings = Settings(
        _env_file=None,
        environment="production",
        auth_secret="prod-secret-32-bytes-minimum-value",
        cors_origins=("https://redline-production.vercel.app",),
        upload_storage_backend="persistent-local",
    )

    assert settings.upload_storage_backend == "persistent-local"


def test_production_accepts_explicit_ephemeral_demo_upload_storage():
    settings = Settings(
        _env_file=None,
        environment="production",
        auth_secret="prod-secret-32-bytes-minimum-value",
        cors_origins=("https://redline-production.vercel.app",),
        upload_storage_backend="ephemeral-demo",
    )

    assert settings.upload_storage_backend == "ephemeral-demo"


def test_cors_origins_accept_comma_separated_env(monkeypatch):
    monkeypatch.setenv(
        "REDLINE_CORS_ORIGINS",
        "https://redline-production.vercel.app, https://redline-preview.vercel.app",
    )

    settings = Settings(_env_file=None)

    assert settings.cors_origins == (
        "https://redline-production.vercel.app",
        "https://redline-preview.vercel.app",
    )


def test_production_cors_requires_exact_https_origin_allowlist():
    with pytest.raises(ValidationError, match="REDLINE_CORS_ORIGINS"):
        Settings(
            _env_file=None,
            environment="production",
            auth_secret="prod-secret-32-bytes-minimum-value",
        )


def test_production_cors_clears_local_development_regex():
    settings = Settings(
        _env_file=None,
        environment="production",
        auth_secret="prod-secret-32-bytes-minimum-value",
        cors_origins=("https://redline-production.vercel.app",),
        upload_storage_backend="persistent-local",
    )

    assert settings.cors_origin_regex is None


def test_production_cors_rejects_wildcard_origin_regex():
    with pytest.raises(ValidationError, match="REDLINE_CORS_ORIGIN_REGEX"):
        Settings(
            _env_file=None,
            environment="production",
            auth_secret="prod-secret-32-bytes-minimum-value",
            cors_origins=("https://redline-production.vercel.app",),
            upload_storage_backend="persistent-local",
            cors_origin_regex=r"https://.*\.vercel\.app$",
        )


def test_auth_rate_limit_settings_are_configurable(monkeypatch):
    monkeypatch.setenv("REDLINE_AUTH_RATE_LIMIT_WINDOW_SECONDS", "120")
    monkeypatch.setenv("REDLINE_AUTH_REGISTER_RATE_LIMIT_MAX_ATTEMPTS", "2")
    monkeypatch.setenv("REDLINE_AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("REDLINE_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX_ATTEMPTS", "4")
    monkeypatch.setenv("REDLINE_AUTH_GOOGLE_RATE_LIMIT_MAX_ATTEMPTS", "8")
    monkeypatch.setenv("REDLINE_AUTH_AVATAR_UPLOAD_RATE_LIMIT_MAX_ATTEMPTS", "9")

    settings = Settings(_env_file=None)

    assert settings.auth_rate_limit_window_seconds == 120
    assert settings.auth_register_rate_limit_max_attempts == 2
    assert settings.auth_login_rate_limit_max_attempts == 3
    assert settings.auth_password_change_rate_limit_max_attempts == 4
    assert settings.auth_google_rate_limit_max_attempts == 8
    assert settings.auth_avatar_upload_rate_limit_max_attempts == 9


def test_embedding_vector_column_exposes_pgvector_distance_operator():
    expression = DocumentBlock.embedding_vector.cosine_distance([0.0] * EMBEDDING_DIMENSIONS)

    assert expression is not None


def test_embedding_dimension_matches_gemini_embedding_runtime():
    assert EMBEDDING_DIMENSIONS == 3072
