from io import BytesIO
import json

import httpx
from docx import Document as DocxDocument
from sqlalchemy import select

from app.core.config import settings
from app.models import DocumentBlock
from app.services import rag_service


def _build_docx(paragraphs: list[tuple[str, str | None]]) -> bytes:
    document = DocxDocument()
    for text, style in paragraphs:
        paragraph = document.add_paragraph(text)
        if style is not None:
            paragraph.style = style

    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_parse_generates_embeddings_for_document_blocks(client, auth_headers, session_factory):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "RAG Project", "description": "Embedding baseline"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Embedding Spec",
            "document_type": "SPEC",
            "description": "Embedding target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    version_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "embedding.docx",
                _build_docx(
                    [
                        ("Liability", "Heading 1"),
                        ("The liability cap is limited to $500,000.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )
    version_id = version_response.json()["data"]["id"]

    parse_response = client.post(f"/api/v1/document-versions/{version_id}/parse", headers=auth_headers)
    assert parse_response.status_code == 200

    with session_factory() as session:
        blocks = list(
            session.scalars(
                select(DocumentBlock)
                .where(DocumentBlock.document_version_id == version_id)
                .order_by(DocumentBlock.order_index)
            )
        )

    assert blocks
    assert all(block.embedding_vector_json for block in blocks)
    assert all(block.embedding_vector for block in blocks)
    assert all(block.embedding_provider for block in blocks)


def test_openai_compatible_embedding_provider_returns_configured_vector(monkeypatch):
    captured_request = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_request["url"] = str(request.url)
        captured_request["authorization"] = request.headers.get("authorization")
        captured_request["payload"] = request.read().decode("utf-8")
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {
                        "object": "embedding",
                        "index": 0,
                        "embedding": [0.001] * 3072,
                    }
                ],
                "model": "gemini/gemini-embedding-2-preview",
            },
        )

    monkeypatch.setattr(settings, "rag_embedding_provider", "openai_compatible")
    monkeypatch.setattr(settings, "rag_embedding_base_url", "http://embedding.test/v1")
    monkeypatch.setattr(settings, "rag_embedding_api_key", "embedding-key")
    monkeypatch.setattr(settings, "rag_embedding_model", "gemini/gemini-embedding-2-preview")
    monkeypatch.setattr(settings, "rag_embedding_dimensions", 3072)
    monkeypatch.setattr(settings, "rag_embedding_fallback_to_local_hash", False)
    monkeypatch.setattr(
        rag_service,
        "_embedding_client_factory",
        lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout),
    )

    provider, vector, vector_json = rag_service.build_block_embedding_payload_from_text(
        block_type="paragraph",
        section_title="Liability",
        content="The liability cap is limited to $500,000.",
    )

    assert provider == "openai-compatible:gemini/gemini-embedding-2-preview"
    assert len(vector) == 3072
    assert rag_service.deserialize_embedding(vector_json) == vector
    assert captured_request["url"] == "http://embedding.test/v1/embeddings"
    assert captured_request["authorization"] == "Bearer embedding-key"
    assert "gemini/gemini-embedding-2-preview" in captured_request["payload"]


def test_parse_batches_openai_compatible_embeddings_for_document_blocks(
    monkeypatch,
    client,
    auth_headers,
    session_factory,
):
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read().decode("utf-8"))
        requests.append(payload)
        inputs = payload["input"]
        assert isinstance(inputs, list)
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {
                        "object": "embedding",
                        "index": index,
                        "embedding": [0.01 + index] * 3072,
                    }
                    for index, _text in enumerate(inputs)
                ],
                "model": "gemini/gemini-embedding-2-preview",
            },
        )

    monkeypatch.setattr(settings, "rag_embedding_provider", "openai_compatible")
    monkeypatch.setattr(settings, "rag_embedding_base_url", "http://embedding.test/v1")
    monkeypatch.setattr(settings, "rag_embedding_api_key", "embedding-key")
    monkeypatch.setattr(settings, "rag_embedding_model", "gemini/gemini-embedding-2-preview")
    monkeypatch.setattr(settings, "rag_embedding_dimensions", 3072)
    monkeypatch.setattr(settings, "rag_embedding_fallback_to_local_hash", False)
    monkeypatch.setattr(
        rag_service,
        "_embedding_client_factory",
        lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout),
    )

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Batched RAG Project", "description": "Embedding latency baseline"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Batched Embedding Spec",
            "document_type": "SPEC",
            "description": "Embedding target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    version_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "batched-embedding.docx",
                _build_docx(
                    [
                        ("Liability", "Heading 1"),
                        ("The liability cap is limited to $500,000.", None),
                        ("Term", "Heading 1"),
                        ("The agreement renews after twelve months.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )
    version_id = version_response.json()["data"]["id"]

    parse_response = client.post(f"/api/v1/document-versions/{version_id}/parse", headers=auth_headers)
    assert parse_response.status_code == 200

    with session_factory() as session:
        blocks = list(
            session.scalars(
                select(DocumentBlock)
                .where(DocumentBlock.document_version_id == version_id)
                .order_by(DocumentBlock.order_index)
            )
        )

    assert len(blocks) == 4
    assert len(requests) == 1
    assert len(requests[0]["input"]) == len(blocks)
    assert [block.embedding_provider for block in blocks] == [
        "openai-compatible:gemini/gemini-embedding-2-preview"
    ] * len(blocks)
    assert blocks[0].embedding_vector == [0.01] * 3072
    assert blocks[3].embedding_vector == [3.01] * 3072


def test_embedding_provider_falls_back_to_local_hash_when_configured(monkeypatch):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "provider unavailable"}})

    monkeypatch.setattr(settings, "rag_embedding_provider", "openai_compatible")
    monkeypatch.setattr(settings, "rag_embedding_base_url", "http://embedding.test/v1")
    monkeypatch.setattr(settings, "rag_embedding_api_key", "embedding-key")
    monkeypatch.setattr(settings, "rag_embedding_model", "gemini/gemini-embedding-2-preview")
    monkeypatch.setattr(settings, "rag_embedding_dimensions", 3072)
    monkeypatch.setattr(settings, "rag_embedding_fallback_to_local_hash", True)
    monkeypatch.setattr(
        rag_service,
        "_embedding_client_factory",
        lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout),
    )

    provider, vector, vector_json = rag_service.build_block_embedding_payload_from_text(
        block_type="paragraph",
        section_title="Liability",
        content="The liability cap is limited to $500,000.",
    )

    assert provider == "local-hash"
    assert len(vector) == 3072
    assert rag_service.deserialize_embedding(vector_json) == vector


def test_retrieval_reembeds_blocks_when_query_falls_back_to_local_hash(
    monkeypatch,
    client,
    auth_headers,
    session_factory,
):
    provider_available = {"value": True}

    def handler(request: httpx.Request) -> httpx.Response:
        if not provider_available["value"]:
            return httpx.Response(500, json={"error": {"message": "provider unavailable"}})

        payload = json.loads(request.read().decode("utf-8"))
        inputs = payload["input"]
        assert isinstance(inputs, list)
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {
                        "object": "embedding",
                        "index": index,
                        "embedding": [0.01 + index] * 3072,
                    }
                    for index, _text in enumerate(inputs)
                ],
                "model": "gemini/gemini-embedding-2-preview",
            },
        )

    monkeypatch.setattr(settings, "rag_embedding_provider", "openai_compatible")
    monkeypatch.setattr(settings, "rag_embedding_base_url", "http://embedding.test/v1")
    monkeypatch.setattr(settings, "rag_embedding_api_key", "embedding-key")
    monkeypatch.setattr(settings, "rag_embedding_model", "gemini/gemini-embedding-2-preview")
    monkeypatch.setattr(settings, "rag_embedding_dimensions", 3072)
    monkeypatch.setattr(settings, "rag_embedding_fallback_to_local_hash", True)
    monkeypatch.setattr(
        rag_service,
        "_embedding_client_factory",
        lambda timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout),
    )

    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Fallback Retrieval", "description": "Provider mismatch regression"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    document_response = client.post(
        f"/api/v1/projects/{project_id}/documents",
        json={
            "title": "Fallback Retrieval Spec",
            "document_type": "CONTRACT",
            "description": "Embedding provider mismatch target",
        },
        headers=auth_headers,
    )
    document_id = document_response.json()["data"]["id"]

    version_response = client.post(
        f"/api/v1/documents/{document_id}/versions",
        files={
            "file": (
                "fallback-retrieval.docx",
                _build_docx(
                    [
                        ("Liability", "Heading 1"),
                        ("The liability cap is limited to $500,000.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"version_label": "v1.0"},
        headers=auth_headers,
    )
    version_id = version_response.json()["data"]["id"]
    parse_response = client.post(f"/api/v1/document-versions/{version_id}/parse", headers=auth_headers)
    assert parse_response.status_code == 200

    with session_factory() as session:
        provider_backed_blocks = list(
            session.scalars(
                select(DocumentBlock)
                .where(DocumentBlock.document_version_id == version_id)
                .order_by(DocumentBlock.order_index)
            )
        )
        assert provider_backed_blocks
        assert {block.embedding_provider for block in provider_backed_blocks} == {
            "openai-compatible:gemini/gemini-embedding-2-preview"
        }

        provider_available["value"] = False
        results = rag_service.retrieve_similar_blocks(
            session,
            document_id=document_id,
            query="What is the liability cap?",
            limit=2,
        )

        refreshed_blocks = list(
            session.scalars(
                select(DocumentBlock)
                .where(DocumentBlock.document_version_id == version_id)
                .order_by(DocumentBlock.order_index)
            )
        )

    assert results
    assert any("liability cap" in result["content"].lower() for result in results)
    assert {block.embedding_provider for block in refreshed_blocks} == {"local-hash"}
