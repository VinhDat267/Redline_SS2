from app.core.config import BACKEND_ROOT


def test_backend_dockerfile_documents_database_backed_auth_rate_limit_worker_scaling():
    dockerfile = (BACKEND_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "--workers ${WEB_CONCURRENCY:-1}" in dockerfile
    assert "Auth rate limits are stored in the database" in dockerfile
    assert "Auth rate limits are in-memory" not in dockerfile
