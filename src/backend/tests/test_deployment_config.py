from app.core.config import BACKEND_ROOT

REPO_ROOT = BACKEND_ROOT.parents[1]


def test_backend_dockerfile_documents_database_backed_auth_rate_limit_worker_scaling():
    dockerfile = (BACKEND_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "--workers ${WEB_CONCURRENCY:-1}" in dockerfile
    assert "Auth rate limits are stored in the database" in dockerfile
    assert "Auth rate limits are in-memory" not in dockerfile


def test_docker_compose_runs_full_local_stack():
    compose = (REPO_ROOT / "compose.yml").read_text(encoding="utf-8")
    frontend_dockerfile = (REPO_ROOT / "src" / "frontend" / "Dockerfile").read_text(encoding="utf-8")

    assert "postgres:" in compose
    assert "backend:" in compose
    assert "frontend:" in compose
    assert "target: backend" in compose
    assert "target: frontend" in compose
    assert "REDLINE_DATABASE_URL=postgresql+psycopg://redline:redline@postgres:5432/redline" in compose
    assert '"8000:8000"' in compose
    assert '"5173:5173"' in compose
    assert '"dev", "--", "--host", "0.0.0.0"' in frontend_dockerfile
