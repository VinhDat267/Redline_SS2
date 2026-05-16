from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.dependencies import get_db_session
from app.core.config import settings
from app.core.vector_config import EMBEDDING_DIMENSIONS
from app.core.security import build_demo_password_hash, create_access_token
from app.main import create_app
from app.models import Base, User


@pytest.fixture(autouse=True)
def default_test_rag_embeddings(monkeypatch):
    monkeypatch.setattr(settings, "rag_embedding_provider", "local-hash")
    monkeypatch.setattr(settings, "rag_embedding_base_url", None)
    monkeypatch.setattr(settings, "rag_embedding_api_key", None)
    monkeypatch.setattr(settings, "rag_embedding_model", "gemini/gemini-embedding-2-preview")
    monkeypatch.setattr(settings, "rag_embedding_dimensions", EMBEDDING_DIMENSIONS)
    monkeypatch.setattr(settings, "rag_embedding_timeout_seconds", 30.0)
    monkeypatch.setattr(settings, "rag_embedding_batch_size", 64)
    monkeypatch.setattr(settings, "rag_embedding_fallback_to_local_hash", True)
    monkeypatch.setattr(settings, "contract_chat_llm_enabled", False)


@pytest.fixture()
def session_factory(tmp_path: Path):
    database_file = tmp_path / "redline-test.db"
    engine = create_engine(
        f"sqlite:///{database_file}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    yield TestingSessionLocal

    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def app(session_factory):
    application = create_app(session_factory=session_factory, start_ai_worker=False)

    def override_get_db_session():
        database = session_factory()
        try:
            yield database
        finally:
            database.close()

    application.dependency_overrides[get_db_session] = override_get_db_session
    return application


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture()
def auth_headers(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "week7@example.com",
            "display_name": "Week 7 Tester",
            "password": "redline123",
        },
    )
    assert response.status_code == 201
    user = response.json()["data"]["user"]
    token = create_access_token(user["id"], token_version=0)
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def register_user(client):
    counter = {"value": 0}

    def _register(*, email: str | None = None, display_name: str | None = None, password: str = "redline123"):
        counter["value"] += 1
        next_index = counter["value"]
        user_email = email or f"user{next_index}@example.com"
        user_display_name = display_name or f"User {next_index}"

        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": user_email,
                "display_name": user_display_name,
                "password": password,
            },
        )
        assert response.status_code == 201
        payload = response.json()["data"]
        token = create_access_token(payload["user"]["id"], token_version=0)
        client.cookies.clear()
        return {
            "headers": {"Authorization": f"Bearer {token}"},
            "user": payload["user"],
        }

    return _register


@pytest.fixture()
def seeded_users(session_factory):
    with session_factory() as session:
        demo_password_hash = build_demo_password_hash()
        users = [
            User(email="vinh@example.com", display_name="Vinh", password_hash=demo_password_hash),
            User(email="my@example.com", display_name="My", password_hash=demo_password_hash),
            User(email="ly@example.com", display_name="Ly", password_hash=demo_password_hash),
        ]
        session.add_all(users)
        session.commit()
        for user in users:
            session.refresh(user)
        return users
