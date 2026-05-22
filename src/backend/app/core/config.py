import json
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
from sqlalchemy.engine import make_url


BACKEND_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ENV_FILE = BACKEND_ROOT / ".env"
DEFAULT_DATABASE_URL = "postgresql+psycopg://redline:redline@127.0.0.1:5432/redline"
DEFAULT_UPLOADS_DIR = str(BACKEND_ROOT / "uploads")
DEFAULT_AUTH_SECRET = "redline-week7-local-dev-secret"
LOCAL_CORS_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173")
LOCAL_CORS_ORIGIN_REGEX = r"https?://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$"
INSECURE_AUTH_SECRETS = {
    "",
    DEFAULT_AUTH_SECRET,
    "change-me",
    "replace-me",
    "replace-with-a-random-32-byte-secret",
}
REQUIRES_SECURE_AUTH_SECRET_ENVIRONMENTS = {"production", "prod", "staging", "stage", "deploy", "deployed"}
LOCAL_CORS_HOSTS = {"127.0.0.1", "localhost", "::1"}
UPLOAD_STORAGE_BACKENDS = {"local", "persistent-local", "ephemeral-demo", "object"}


class Settings(BaseSettings):
    app_name: str = "redline-backend"
    environment: str = "local"
    database_url: str = DEFAULT_DATABASE_URL
    uploads_dir: str = DEFAULT_UPLOADS_DIR
    upload_storage_backend: str = "local"
    object_storage_endpoint: str | None = None
    object_storage_bucket: str | None = None
    object_storage_region: str | None = None
    object_storage_access_key_id: str | None = None
    object_storage_secret_access_key: str | None = None
    object_storage_public_base_url: str | None = None
    document_upload_max_bytes: int = 25 * 1024 * 1024
    auth_secret: str = DEFAULT_AUTH_SECRET
    access_token_expire_minutes: int = 720
    google_client_id: str | None = None
    auth_cookie_secure: bool | None = None
    auth_cookie_samesite: str = "lax"
    auth_rate_limit_window_seconds: int = 300
    auth_register_rate_limit_max_attempts: int = 3
    auth_login_rate_limit_max_attempts: int = 5
    auth_password_change_rate_limit_max_attempts: int = 5
    auth_google_rate_limit_max_attempts: int = 10
    auth_avatar_upload_rate_limit_max_attempts: int = 20
    cors_origins: Annotated[tuple[str, ...], NoDecode] = LOCAL_CORS_ORIGINS
    cors_origin_regex: str | None = LOCAL_CORS_ORIGIN_REGEX
    ai_primary_provider: str = "gemini"
    ai_gemini_api_key: str | None = None
    ai_gemini_model: str = "gemini-3.1-flash-lite"
    ai_fallback_provider: str = "openai"
    ai_openai_api_key: str | None = None
    ai_openai_model: str = "gpt-4.1-mini"
    ai_openai_base_url: str | None = None
    ai_openai_fallback_api_key: str | None = None
    ai_openai_fallback_model: str | None = None
    ai_openai_fallback_base_url: str | None = None
    ai_batch_worker_enabled: bool = True
    ai_batch_concurrency: int = 2
    ai_batch_poll_interval_ms: int = 2000
    ai_batch_stale_item_seconds: int = 300
    ai_batch_stale_job_seconds: int = 600
    ai_batch_inter_item_delay: float = 7.0
    ai_review_batch_size: int = 5
    ai_rate_limit_window_seconds: int = 60
    ai_chat_rate_limit_max_attempts: int = 10
    ai_summary_rate_limit_max_attempts: int = 5
    ai_review_draft_rate_limit_max_attempts: int = 10
    ai_batch_rate_limit_max_attempts: int = 3
    rag_embedding_provider: str = "local-hash"
    rag_embedding_base_url: str | None = None
    rag_embedding_api_key: str | None = None
    rag_embedding_model: str = "gemini-embedding-2"
    rag_embedding_dimensions: int = 3072
    rag_embedding_timeout_seconds: float = 30.0
    rag_embedding_batch_size: int = 64
    rag_embedding_fallback_to_local_hash: bool = True
    contract_chat_streaming_enabled: bool = True
    contract_chat_llm_enabled: bool = True
    pdf_ocr_enabled: bool = True
    tesseract_cmd: str | None = None
    tessdata_prefix: str | None = None
    pdf_ocr_languages: str = "eng+vie"
    pdf_ocr_min_confidence: float = 80.0
    pdf_ocr_min_retained_tokens: int = 12
    pdf_ocr_max_low_confidence_token_ratio: float = 0.25
    pdf_ocr_dpi: int = 200
    pdf_text_min_chars_per_page: int = 40
    pdf_text_min_tokens_per_page: int = 8
    pdf_text_min_printable_ratio: float = 0.85
    pdf_text_max_duplicate_token_ratio: float = 0.35
    pdf_blank_page_max_ink_ratio: float = 0.005

    model_config = SettingsConfigDict(
        env_file=BACKEND_ENV_FILE,
        env_prefix="REDLINE_",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> tuple[str, ...] | object:
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return tuple()
            if raw_value.startswith("["):
                parsed_value = json.loads(raw_value)
                if not isinstance(parsed_value, list):
                    raise ValueError("REDLINE_CORS_ORIGINS must be a JSON array or comma-separated origins")
                return tuple(str(origin).strip() for origin in parsed_value if str(origin).strip())
            return tuple(origin.strip() for origin in raw_value.split(",") if origin.strip())
        return value

    @field_validator("cors_origin_regex", mode="before")
    @classmethod
    def parse_cors_origin_regex(cls, value: object) -> str | None | object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @model_validator(mode="after")
    def validate_runtime_settings(self) -> "Settings":
        uploads_path = Path(self.uploads_dir)
        if not uploads_path.is_absolute():
            self.uploads_dir = str(BACKEND_ROOT / uploads_path)

        normalized_environment = self.environment.strip().lower() or "local"
        auth_secret = self.auth_secret.strip()
        auth_cookie_samesite = self.auth_cookie_samesite.strip().lower()
        upload_storage_backend = self.upload_storage_backend.strip().lower()
        self.environment = normalized_environment
        self.auth_secret = auth_secret
        self.auth_cookie_samesite = auth_cookie_samesite
        self.upload_storage_backend = upload_storage_backend
        self.cors_origins = tuple(_normalize_cors_origin(origin) for origin in self.cors_origins)

        if upload_storage_backend not in UPLOAD_STORAGE_BACKENDS:
            raise ValueError(
                "REDLINE_UPLOAD_STORAGE_BACKEND must be one of: local, persistent-local, ephemeral-demo, object"
            )
        if self.document_upload_max_bytes <= 0:
            raise ValueError("REDLINE_DOCUMENT_UPLOAD_MAX_BYTES must be greater than 0")
        if upload_storage_backend == "object":
            self.object_storage_endpoint = _normalize_optional_string(self.object_storage_endpoint)
            self.object_storage_bucket = _normalize_optional_string(self.object_storage_bucket)
            self.object_storage_region = _normalize_optional_string(self.object_storage_region)
            self.object_storage_access_key_id = _normalize_optional_string(self.object_storage_access_key_id)
            self.object_storage_secret_access_key = _normalize_optional_string(self.object_storage_secret_access_key)
            self.object_storage_public_base_url = _normalize_optional_url(self.object_storage_public_base_url)
            if not self.object_storage_bucket:
                raise ValueError("REDLINE_OBJECT_STORAGE_BUCKET is required when upload storage backend is object")
            if not self.object_storage_access_key_id or not self.object_storage_secret_access_key:
                raise ValueError(
                    "REDLINE_OBJECT_STORAGE_ACCESS_KEY_ID and "
                    "REDLINE_OBJECT_STORAGE_SECRET_ACCESS_KEY are required when upload storage backend is object"
                )

        if normalized_environment in REQUIRES_SECURE_AUTH_SECRET_ENVIRONMENTS:
            if auth_secret in INSECURE_AUTH_SECRETS or len(auth_secret) < 32:
                raise ValueError(
                    "REDLINE_AUTH_SECRET must be set to a unique secret with at least "
                    "32 characters outside local development"
                )

            cors_regex = self.cors_origin_regex
            if cors_regex == LOCAL_CORS_ORIGIN_REGEX:
                cors_regex = None
            elif cors_regex:
                raise ValueError(
                    "REDLINE_CORS_ORIGIN_REGEX is not allowed outside local development; "
                    "use exact REDLINE_CORS_ORIGINS values"
                )
            self.cors_origin_regex = cors_regex

            if not self.cors_origins:
                raise ValueError("REDLINE_CORS_ORIGINS must list the deployed frontend origin")
            for origin in self.cors_origins:
                parsed_origin = urlparse(origin)
                if parsed_origin.scheme != "https" or parsed_origin.hostname in LOCAL_CORS_HOSTS:
                    raise ValueError(
                        "REDLINE_CORS_ORIGINS must contain exact HTTPS deployed frontend origins"
                    )

            if upload_storage_backend == "local":
                raise ValueError(
                    "REDLINE_UPLOAD_STORAGE_BACKEND=local is only for local development. "
                    "Use persistent-local with a durable mounted uploads directory, or "
                    "ephemeral-demo for demo-only Heroku deployments where uploaded files "
                    "may be lost on dyno restart."
                )

        if auth_cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError("REDLINE_AUTH_COOKIE_SAMESITE must be one of: lax, strict, none")
        if auth_cookie_samesite == "none" and not self.auth_cookie_secure_enabled:
            raise ValueError("REDLINE_AUTH_COOKIE_SECURE must be true when SameSite=None")

        return self

    @property
    def is_sqlite(self) -> bool:
        return make_url(self.database_url).drivername.startswith("sqlite")

    @property
    def auth_cookie_secure_enabled(self) -> bool:
        if self.auth_cookie_secure is not None:
            return self.auth_cookie_secure
        return self.environment not in {"local", "dev", "development", "test"}


def _normalize_cors_origin(origin: str) -> str:
    normalized_origin = origin.strip().rstrip("/")
    parsed_origin = urlparse(normalized_origin)
    if (
        not normalized_origin
        or "*" in normalized_origin
        or parsed_origin.scheme not in {"http", "https"}
        or not parsed_origin.netloc
        or parsed_origin.path
        or parsed_origin.params
        or parsed_origin.query
        or parsed_origin.fragment
    ):
        raise ValueError("REDLINE_CORS_ORIGINS must contain exact origins without paths or wildcards")
    return normalized_origin


def _normalize_optional_string(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_optional_url(value: str | None) -> str | None:
    normalized = _normalize_optional_string(value)
    if normalized is None:
        return None
    return normalized.rstrip("/")


settings = Settings()
