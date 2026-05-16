from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"


def test_ci_workflow_runs_backend_frontend_and_pgvector_migration_smoke():
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")

    assert "pgvector/pgvector" in workflow
    assert "REDLINE_DATABASE_URL: postgresql+psycopg://redline:redline@127.0.0.1:5432/redline" in workflow
    assert "python -m alembic upgrade head" in workflow
    assert "python -m alembic current" in workflow
    assert "python -m pytest tests -q" in workflow
    assert "npm run test -- --run" in workflow
    assert "npm run build" in workflow
