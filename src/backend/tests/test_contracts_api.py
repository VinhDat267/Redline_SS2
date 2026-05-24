import json
from io import BytesIO
from types import SimpleNamespace

import pytest
from docx import Document as DocxDocument
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import ChatAttempt, ChatMessage, ChatSession, Document, DocumentVersion
from app.services import contract_chat
from app.services import contract_chat_attempts
from app.services import documents as document_service
from app.services.document_parser import DocumentParseError


def _build_contract_docx(paragraphs: list[tuple[str, str | None]]) -> bytes:
    document = DocxDocument()
    for text, style in paragraphs:
        paragraph = document.add_paragraph(text)
        if style is not None:
            paragraph.style = style

    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _create_contract_chat_session(client, auth_headers) -> dict[str, int]:
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Contract Chat", "description": "Legal Q&A"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Vendor NDA",
            "contract_type": "NDA",
            "description": "Vendor confidentiality agreement",
        },
        headers=auth_headers,
    )
    contract_id = contract_response.json()["data"]["id"]

    draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "vendor-nda.docx",
                _build_contract_docx(
                    [
                        ("Limitation of Liability", "Heading 1"),
                        ("The liability cap is limited to $1,000,000.", None),
                        ("Termination", "Heading 1"),
                        ("Either party may terminate for material breach with 30 days notice.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "vendor-v1"},
        headers=auth_headers,
    )
    draft_id = draft_response.json()["data"]["id"]
    assert client.post(f"/api/v1/contract-drafts/{draft_id}/parse", headers=auth_headers).status_code == 200

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={"draft_id": draft_id, "title": "Initial contract review"},
        headers=auth_headers,
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["data"]["id"]

    return {
        "contract_id": contract_id,
        "draft_id": draft_id,
        "session_id": session_id,
    }


def _create_contract_compare_chat_setup(client, auth_headers) -> dict[str, int]:
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Compare Chat", "description": "Compare-aware Q&A"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Service Agreement",
            "contract_type": "MSA",
            "description": "Agreement with revised liability terms",
        },
        headers=auth_headers,
    )
    contract_id = contract_response.json()["data"]["id"]

    source_draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "msa-v1.docx",
                _build_contract_docx(
                    [
                        ("Limitation of Liability", "Heading 1"),
                        ("The liability cap is $100,000 and excludes confidentiality breaches.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "customer-v1"},
        headers=auth_headers,
    )
    target_draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "msa-v2.docx",
                _build_contract_docx(
                    [
                        ("Limitation of Liability", "Heading 1"),
                        ("The liability cap is $250,000 and includes confidentiality breaches.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "vendor-v2"},
        headers=auth_headers,
    )
    source_draft_id = source_draft_response.json()["data"]["id"]
    target_draft_id = target_draft_response.json()["data"]["id"]

    assert client.post(f"/api/v1/contract-drafts/{source_draft_id}/parse", headers=auth_headers).status_code == 200
    assert client.post(f"/api/v1/contract-drafts/{target_draft_id}/parse", headers=auth_headers).status_code == 200

    compare_response = client.post(
        f"/api/v1/contracts/{contract_id}/compare-runs",
        json={"source_draft_id": source_draft_id, "target_draft_id": target_draft_id},
        headers=auth_headers,
    )
    assert compare_response.status_code == 201
    compare_run_id = compare_response.json()["data"]["id"]

    return {
        "contract_id": contract_id,
        "source_draft_id": source_draft_id,
        "target_draft_id": target_draft_id,
        "compare_run_id": compare_run_id,
    }


def test_contract_alias_routes_wrap_document_and_draft_flows(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Contract Project", "description": "Legal workspace"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    create_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Mutual NDA",
            "contract_type": "NDA",
            "description": "Mutual confidentiality agreement",
        },
        headers=auth_headers,
    )

    assert create_response.status_code == 201
    created_contract = create_response.json()["data"]
    assert created_contract["title"] == "Mutual NDA"
    assert created_contract["contract_type"] == "NDA"
    contract_id = created_contract["id"]

    list_response = client.get(f"/api/v1/projects/{project_id}/contracts", headers=auth_headers)
    assert list_response.status_code == 200
    assert list_response.json()["data"][0]["id"] == contract_id

    detail_response = client.get(f"/api/v1/contracts/{contract_id}", headers=auth_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["contract_type"] == "NDA"

    draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "nda-v1.docx",
                _build_contract_docx(
                    [
                        ("Confidentiality", "Heading 1"),
                        ("The Receiving Party shall keep information confidential.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "vendor-markup-v1", "notes": "Initial markup"},
        headers=auth_headers,
    )
    assert draft_response.status_code == 201
    created_draft = draft_response.json()["data"]
    assert created_draft["contract_id"] == contract_id
    assert created_draft["draft_label"] == "vendor-markup-v1"

    list_drafts_response = client.get(f"/api/v1/contracts/{contract_id}/drafts", headers=auth_headers)
    assert list_drafts_response.status_code == 200
    assert list_drafts_response.json()["data"] == [created_draft]


def test_contract_compare_alias_returns_legal_semantic_fields(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Contract Compare", "description": "Legal compare"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Service Agreement",
            "contract_type": "SOW",
            "description": "Statement of work",
        },
        headers=auth_headers,
    )
    contract_id = contract_response.json()["data"]["id"]

    source_draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "sow-v1.docx",
                _build_contract_docx(
                    [
                        ("Liability", "Heading 1"),
                        ("The liability cap is $100,000.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "supplier-v1"},
        headers=auth_headers,
    )
    target_draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "sow-v2.docx",
                _build_contract_docx(
                    [
                        ("Liability", "Heading 1"),
                        ("The liability cap is $250,000.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "supplier-v2"},
        headers=auth_headers,
    )
    source_draft_id = source_draft_response.json()["data"]["id"]
    target_draft_id = target_draft_response.json()["data"]["id"]

    assert client.post(f"/api/v1/contract-drafts/{source_draft_id}/parse", headers=auth_headers).status_code == 200
    assert client.post(f"/api/v1/contract-drafts/{target_draft_id}/parse", headers=auth_headers).status_code == 200

    compare_response = client.post(
        f"/api/v1/contracts/{contract_id}/compare-runs",
        json={"source_draft_id": source_draft_id, "target_draft_id": target_draft_id},
        headers=auth_headers,
    )

    assert compare_response.status_code == 201
    compare_payload = compare_response.json()["data"]
    assert compare_payload["contract"]["id"] == contract_id
    assert compare_payload["source_draft"]["id"] == source_draft_id
    assert compare_payload["target_draft"]["id"] == target_draft_id
    assert compare_payload["selected_clause_change_id"] is not None
    compare_run_id = compare_payload["id"]

    clause_change_response = client.get(
        f"/api/v1/contract-compare-runs/{compare_run_id}/clause-changes",
        headers=auth_headers,
    )
    assert clause_change_response.status_code == 200
    clause_changes = clause_change_response.json()["data"]
    assert clause_changes[0]["old_text"] == "The liability cap is $100,000."
    assert clause_changes[0]["new_text"] == "The liability cap is $250,000."


def test_contract_chat_creates_session_and_answers_with_citations(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    contract_id = setup["contract_id"]
    session_id = setup["session_id"]

    message_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "What is the liability cap?"},
        headers=auth_headers,
    )

    assert message_response.status_code == 201
    message_payload = message_response.json()["data"]
    assert "1,000,000" in message_payload["assistant_message"]["content"]
    assert message_payload["assistant_message"]["citations"]
    assert message_payload["assistant_message"]["citations"][0]["block_id"] is not None


def test_contract_chat_session_can_be_scoped_to_compare_run(client, auth_headers):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    target_draft_id = setup["target_draft_id"]
    compare_run_id = setup["compare_run_id"]

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={
            "draft_id": target_draft_id,
            "compare_run_id": compare_run_id,
            "title": "Compare v1 to v2 Q&A",
        },
        headers=auth_headers,
    )

    assert session_response.status_code == 201
    session_payload = session_response.json()["data"]
    assert session_payload["draft_id"] == target_draft_id
    assert session_payload["compare_run_id"] == compare_run_id
    assert session_payload["scope_type"] == "compare_run"


def test_contract_compare_runs_can_be_listed_for_compare_q_and_a(client, auth_headers):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    compare_run_id = setup["compare_run_id"]

    response = client.get(f"/api/v1/contracts/{contract_id}/compare-runs", headers=auth_headers)

    assert response.status_code == 200
    compare_runs = response.json()["data"]
    assert [compare_run["id"] for compare_run in compare_runs] == [compare_run_id]
    assert compare_runs[0]["source_draft"]["draft_label"] == "customer-v1"
    assert compare_runs[0]["target_draft"]["draft_label"] == "vendor-v2"


def test_contract_compare_run_reports_stale_after_reparse(client, auth_headers):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    target_draft_id = setup["target_draft_id"]
    compare_run_id = setup["compare_run_id"]

    initial_response = client.get(f"/api/v1/contracts/{contract_id}/compare-runs", headers=auth_headers)
    assert initial_response.status_code == 200
    initial_compare_run = initial_response.json()["data"][0]
    assert initial_compare_run["id"] == compare_run_id
    assert initial_compare_run["is_stale"] is False
    assert initial_compare_run["target_parse_run_id"] == initial_compare_run["target_draft"]["active_parse_run_id"]

    assert client.post(f"/api/v1/contract-drafts/{target_draft_id}/parse", headers=auth_headers).status_code == 200

    stale_response = client.get(f"/api/v1/contracts/{contract_id}/compare-runs", headers=auth_headers)
    assert stale_response.status_code == 200
    stale_compare_run = stale_response.json()["data"][0]
    assert stale_compare_run["id"] == compare_run_id
    assert stale_compare_run["is_stale"] is True
    assert stale_compare_run["target_parse_run_id"] != stale_compare_run["target_draft"]["active_parse_run_id"]


def test_contract_compare_chat_rejects_stale_compare_run(client, auth_headers):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    target_draft_id = setup["target_draft_id"]
    compare_run_id = setup["compare_run_id"]

    assert client.post(f"/api/v1/contract-drafts/{target_draft_id}/parse", headers=auth_headers).status_code == 200

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={
            "draft_id": target_draft_id,
            "compare_run_id": compare_run_id,
            "title": "Stale compare Q&A",
        },
        headers=auth_headers,
    )

    assert session_response.status_code == 422
    assert "stale" in session_response.json()["detail"].lower()


def test_existing_compare_chat_session_rejects_new_questions_after_reparse(client, auth_headers):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    target_draft_id = setup["target_draft_id"]
    compare_run_id = setup["compare_run_id"]

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={
            "draft_id": target_draft_id,
            "compare_run_id": compare_run_id,
            "title": "Compare v1 to v2 Q&A",
        },
        headers=auth_headers,
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["data"]["id"]

    assert client.post(f"/api/v1/contract-drafts/{target_draft_id}/parse", headers=auth_headers).status_code == 200

    message_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "What changed in liability now?"},
        headers=auth_headers,
    )
    assert message_response.status_code == 422
    assert "stale" in message_response.json()["detail"].lower()

    attempt_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/attempts",
        json={
            "draft_id": target_draft_id,
            "query": "What changed in liability now?",
            "client_request_id": "stale-attempt-1",
        },
        headers=auth_headers,
    )
    assert attempt_response.status_code == 422
    assert "stale" in attempt_response.json()["detail"].lower()


def test_contract_compare_chat_answers_from_deterministic_change_items(client, auth_headers):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    target_draft_id = setup["target_draft_id"]
    compare_run_id = setup["compare_run_id"]

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={
            "draft_id": target_draft_id,
            "compare_run_id": compare_run_id,
            "title": "Compare v1 to v2 Q&A",
        },
        headers=auth_headers,
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "What changed in the liability cap between the two drafts?"},
        headers=auth_headers,
    )

    assert message_response.status_code == 201
    assistant_message = message_response.json()["data"]["assistant_message"]
    assert "$100,000" in assistant_message["content"]
    assert "$250,000" in assistant_message["content"]
    assert assistant_message["provider_used"] == "local-compare"
    assert len(assistant_message["citations"]) >= 2
    citation_scopes = {citation["source_label"] for citation in assistant_message["citations"]}
    assert {"source", "target"} <= citation_scopes
    assert {citation["change_item_id"] for citation in assistant_message["citations"]} == {
        assistant_message["citations"][0]["change_item_id"]
    }


def test_contract_compare_chat_uses_llm_synthesis_when_provider_is_available(client, auth_headers, monkeypatch):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    target_draft_id = setup["target_draft_id"]
    compare_run_id = setup["compare_run_id"]
    captured_payload = {}

    class FakeChatAdapter:
        def generate_contract_chat_answer(self, payload, **kwargs):
            captured_payload.update(payload)
            return SimpleNamespace(
                content=(
                    "The revised draft raises the liability cap from $100,000 to $250,000 "
                    "and brings confidentiality breaches inside that cap [1][2]."
                ),
                provider_used="gemini",
                fallback_used=False,
                error_message=None,
            )

    monkeypatch.setattr(contract_chat.settings, "contract_chat_llm_enabled", True)
    monkeypatch.setattr(contract_chat, "get_llm_adapter", lambda: FakeChatAdapter())

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={
            "draft_id": target_draft_id,
            "compare_run_id": compare_run_id,
            "title": "Compare v1 to v2 Q&A",
        },
        headers=auth_headers,
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "Explain the liability difference in business terms."},
        headers=auth_headers,
    )

    assert message_response.status_code == 201
    assistant_message = message_response.json()["data"]["assistant_message"]
    assert assistant_message["content"].startswith("The revised draft raises the liability cap")
    assert assistant_message["provider_used"] == "gemini:contract-chat"
    assert len(assistant_message["citations"]) >= 2
    assert captured_payload["question"] == "Explain the liability difference in business terms."
    assert captured_payload["contract"]["source_draft_label"] == "customer-v1"
    assert captured_payload["contract"]["target_draft_label"] == "vendor-v2"
    assert captured_payload["instructions"]["truth_boundary"].startswith("Use only the supplied compare metadata")
    assert {item["source_label"] for item in captured_payload["evidence"]} == {"source", "target"}
    assert "$100,000" in captured_payload["evidence"][0]["content"]
    assert "$250,000" in captured_payload["evidence"][1]["content"]
    assert captured_payload["changes"][0]["change_type"] == "modified"
    assert captured_payload["changes"][0]["review_status"] == "open"
    assert captured_payload["changes"][0]["source_content"] == "The liability cap is $100,000 and excludes confidentiality breaches."
    assert captured_payload["changes"][0]["target_content"] == "The liability cap is $250,000 and includes confidentiality breaches."


def test_contract_compare_chat_does_not_use_unrelated_change_items_for_specific_question(
    client,
    auth_headers,
    monkeypatch,
):
    setup = _create_contract_compare_chat_setup(client, auth_headers)
    contract_id = setup["contract_id"]
    target_draft_id = setup["target_draft_id"]
    compare_run_id = setup["compare_run_id"]
    adapter_called = False

    class FakeChatAdapter:
        def generate_contract_chat_answer(self, payload, **kwargs):
            nonlocal adapter_called
            adapter_called = True
            return SimpleNamespace(
                content="Payment terms changed materially.",
                provider_used="gemini",
                fallback_used=False,
                error_message=None,
            )

    monkeypatch.setattr(contract_chat.settings, "contract_chat_llm_enabled", True)
    monkeypatch.setattr(contract_chat, "get_llm_adapter", lambda: FakeChatAdapter())

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={
            "draft_id": target_draft_id,
            "compare_run_id": compare_run_id,
            "title": "Compare v1 to v2 Q&A",
        },
        headers=auth_headers,
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "What changed about payment terms?"},
        headers=auth_headers,
    )

    assert message_response.status_code == 201
    assistant_message = message_response.json()["data"]["assistant_message"]
    assert "compare run does not contain enough grounded evidence" in assistant_message["content"]
    assert assistant_message["provider_used"] == "local-compare"
    assert assistant_message["citations"] == []
    assert adapter_called is False


def test_contract_chat_remembers_session_context_without_document_citations(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    contract_id = setup["contract_id"]
    session_id = setup["session_id"]

    remember_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "Tôi tên là Nguyễn Đạt Vinh."},
        headers=auth_headers,
    )
    assert remember_response.status_code == 201

    recall_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "Tôi tên là gì?"},
        headers=auth_headers,
    )

    assert recall_response.status_code == 201
    assistant_message = recall_response.json()["data"]["assistant_message"]
    assert "Nguyễn Đạt Vinh" in assistant_message["content"]
    assert assistant_message["provider_used"] == "session-memory"
    assert assistant_message["citations"] == []


def test_contract_chat_answers_document_identity_from_metadata(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    contract_id = setup["contract_id"]
    session_id = setup["session_id"]

    identity_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "Tài liệu này là tài liệu gì?"},
        headers=auth_headers,
    )

    assert identity_response.status_code == 201
    identity_message = identity_response.json()["data"]["assistant_message"]
    assert "Vendor NDA" in identity_message["content"]
    assert "NDA" in identity_message["content"]
    assert "Vendor confidentiality agreement" in identity_message["content"]
    assert "vendor-v1" in identity_message["content"]
    assert identity_message["provider_used"] == "contract-metadata"
    assert identity_message["citations"] == []

    title_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "Tên tài liệu đó là gì vậy?"},
        headers=auth_headers,
    )

    assert title_response.status_code == 201
    title_message = title_response.json()["data"]["assistant_message"]
    assert "Vendor NDA" in title_message["content"]
    assert "1,000,000" not in title_message["content"]
    assert title_message["provider_used"] == "contract-metadata"
    assert title_message["citations"] == []


def test_contract_chat_uses_llm_synthesis_when_provider_is_available(client, auth_headers, monkeypatch):
    setup = _create_contract_chat_session(client, auth_headers)
    contract_id = setup["contract_id"]
    session_id = setup["session_id"]

    captured_payload = {}

    class FakeChatAdapter:
        def generate_contract_chat_answer(self, payload, **kwargs):
            captured_payload.update(payload)
            return SimpleNamespace(
                content="The liability cap is $1,000,000 under the current draft [1].",
                provider_used="openai",
                fallback_used=False,
                error_message=None,
            )

    monkeypatch.setattr(contract_chat.settings, "contract_chat_llm_enabled", True)
    monkeypatch.setattr(contract_chat, "get_llm_adapter", lambda: FakeChatAdapter())

    response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "What is the liability cap?"},
        headers=auth_headers,
    )

    assert response.status_code == 201
    assistant_message = response.json()["data"]["assistant_message"]
    assert assistant_message["content"] == "The liability cap is $1,000,000 under the current draft [1]."
    assert assistant_message["provider_used"] == "openai:contract-chat"
    assert assistant_message["citations"]
    assert captured_payload["contract"]["title"] == "Vendor NDA"
    assert captured_payload["question"] == "What is the liability cap?"
    assert captured_payload["evidence"][0]["citation_number"] == 1
    assert "liability cap" in captured_payload["evidence"][0]["content"]


def test_contract_chat_prefers_relevant_substantive_clause_for_ownership_question(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Contract Chat SOW", "description": "Ownership Q&A"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Implementation SOW",
            "contract_type": "SOW",
            "description": "Implementation statement of work",
        },
        headers=auth_headers,
    )
    contract_id = contract_response.json()["data"]["id"]

    draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "sow-v2.docx",
                _build_contract_docx(
                    [
                        ("Deliverables", "Heading 1"),
                        (
                            "Vendor will provide a requirements workshop, clickable prototype, API integration guide, and deployment checklist.",
                            None,
                        ),
                        ("Payment", "Heading 1"),
                        ("Fifty percent of fees are due upfront and remaining invoices are payable 15 days after invoice.", None),
                        ("IP Ownership", "Heading 1"),
                        (
                            "Vendor retains ownership of all deliverables and grants Customer a non-exclusive internal-use license.",
                            None,
                        ),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "sow-v2"},
        headers=auth_headers,
    )
    draft_id = draft_response.json()["data"]["id"]
    assert client.post(f"/api/v1/contract-drafts/{draft_id}/parse", headers=auth_headers).status_code == 200

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={"draft_id": draft_id, "title": "Ownership review"},
        headers=auth_headers,
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "Who owns the deliverables after payment?"},
        headers=auth_headers,
    )

    assert message_response.status_code == 201
    assistant_message = message_response.json()["data"]["assistant_message"]
    assert "Vendor retains ownership" in assistant_message["content"]
    assert "internal-use license" in assistant_message["content"]
    citation_text = " ".join(citation["content"] for citation in assistant_message["citations"])
    assert "Vendor retains ownership" in citation_text
    assert "internal-use license" in citation_text


def test_contract_draft_parse_returns_422_when_parser_rejects_draft(client, auth_headers, monkeypatch):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Parser Failure Project", "description": "PDF parse failure handling"},
        headers=auth_headers,
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Encrypted Addendum",
            "contract_type": "MSA",
            "description": "Draft should fail parser quality policy",
        },
        headers=auth_headers,
    )
    assert contract_response.status_code == 201
    contract_id = contract_response.json()["data"]["id"]

    draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "encrypted-addendum.docx",
                _build_contract_docx([("Confidentiality", "Heading 1")]),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "encrypted-addendum"},
        headers=auth_headers,
    )
    assert draft_response.status_code == 201
    draft_id = draft_response.json()["data"]["id"]

    def reject_parse(database, draft):
        raise DocumentParseError("PDF parser quality policy failed")

    monkeypatch.setattr(document_service, "parse_document_version", reject_parse)
    no_raise_client = TestClient(client.app, raise_server_exceptions=False)

    parse_response = no_raise_client.post(
        f"/api/v1/contract-drafts/{draft_id}/parse",
        headers=auth_headers,
    )

    assert parse_response.status_code == 422
    assert parse_response.json()["detail"] == "PDF parser quality policy failed"


def test_contract_chat_answer_excludes_unrelated_clause_text(client, auth_headers):
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Contract Chat Termination", "description": "Termination Q&A"},
        headers=auth_headers,
    )
    project_id = project_response.json()["data"]["id"]

    contract_response = client.post(
        f"/api/v1/projects/{project_id}/contracts",
        json={
            "title": "Vendor NDA",
            "contract_type": "NDA",
            "description": "Termination review",
        },
        headers=auth_headers,
    )
    contract_id = contract_response.json()["data"]["id"]

    draft_response = client.post(
        f"/api/v1/contracts/{contract_id}/drafts",
        files={
            "file": (
                "nda-v2.docx",
                _build_contract_docx(
                    [
                        ("Confidential Information", "Heading 1"),
                        (
                            "Confidential Information means non-public business information disclosed by either party.",
                            None,
                        ),
                        ("Termination", "Heading 1"),
                        ("Recipient may terminate for convenience with 10 days written notice.", None),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"draft_label": "nda-v2"},
        headers=auth_headers,
    )
    draft_id = draft_response.json()["data"]["id"]
    assert client.post(f"/api/v1/contract-drafts/{draft_id}/parse", headers=auth_headers).status_code == 200

    session_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions",
        json={"draft_id": draft_id, "title": "Termination review"},
        headers=auth_headers,
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        json={"query": "Who can terminate for convenience and how much notice is required?"},
        headers=auth_headers,
    )

    assert message_response.status_code == 201
    answer = message_response.json()["data"]["assistant_message"]["content"]
    assert "Recipient may terminate" in answer
    assert "10 days" in answer
    assert "either party" not in answer


def test_contract_chat_streams_sse_events_and_persists_messages(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    contract_id = setup["contract_id"]
    session_id = setup["session_id"]

    with client.stream(
        "POST",
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages/stream",
        json={"query": "What is the liability cap?"},
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        stream_body = "".join(response.iter_text())

    assert "event: metadata" in stream_body
    assert "event: delta" in stream_body
    assert "event: citations" in stream_body
    assert "event: done" in stream_body
    assert "1,000,000" in stream_body

    event_payloads: dict[str, dict[str, object]] = {}
    for raw_event in stream_body.strip().split("\n\n"):
        lines = raw_event.splitlines()
        event_name = lines[0].removeprefix("event: ").strip()
        payload = json.loads(lines[1].removeprefix("data: ").strip())
        event_payloads[event_name] = payload

    assert event_payloads["metadata"]["session_id"] == session_id
    assert event_payloads["metadata"]["provider_used"] == "local-rag"
    assert event_payloads["citations"]["citations"]
    assert event_payloads["done"]["assistant_message"]["citations"]
    assert "1,000,000" in event_payloads["done"]["assistant_message"]["content"]

    messages_response = client.get(
        f"/api/v1/contracts/{contract_id}/chat/sessions/{session_id}/messages",
        headers=auth_headers,
    )
    assert messages_response.status_code == 200
    messages = messages_response.json()["data"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert "1,000,000" in messages[1]["content"]


def test_contract_chat_attempt_create_persists_user_message(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)

    response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-create-001",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["session_id"] == setup["session_id"]
    assert payload["stream_endpoint"].endswith(f"/attempts/{payload['attempt']['id']}/stream")
    assert payload["cancel_endpoint"].endswith(f"/attempts/{payload['attempt']['id']}/cancel")
    assert payload["user_message"]["role"] == "user"
    assert payload["user_message"]["content"] == "What is the liability cap?"
    assert payload["attempt"]["status"] == "starting"
    assert payload["attempt"]["draft_id"] == setup["draft_id"]
    assert payload["attempt"]["user_message_id"] == payload["user_message"]["id"]
    assert payload["attempt"]["client_request_id"] == "req-create-001"

    messages_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        headers=auth_headers,
    )
    messages = messages_response.json()["data"]
    assert [message["role"] for message in messages] == ["user"]


def test_contract_chat_attempt_create_is_idempotent_by_client_request_id(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    payload = {
        "query": "What is the liability cap?",
        "draft_id": setup["draft_id"],
        "client_request_id": "req-idem-001",
    }

    first = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json=payload,
        headers=auth_headers,
    )
    second = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json=payload,
        headers=auth_headers,
    )

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["data"]["attempt"]["id"] == second.json()["data"]["attempt"]["id"]
    assert first.json()["data"]["user_message"]["id"] == second.json()["data"]["user_message"]["id"]


def test_contract_chat_attempt_rejects_second_active_attempt(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)

    first = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-active-001",
        },
        headers=auth_headers,
    )
    second = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "Can either party terminate?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-active-002",
        },
        headers=auth_headers,
    )

    assert first.status_code == 201
    assert second.status_code == 409


def test_contract_chat_attempt_active_attempt_is_database_enforced(
    client,
    auth_headers,
    session_factory,
):
    setup = _create_contract_chat_session(client, auth_headers)

    with session_factory() as session:
        first_message = ChatMessage(
            session_id=setup["session_id"],
            role="user",
            content="What is the liability cap?",
        )
        second_message = ChatMessage(
            session_id=setup["session_id"],
            role="user",
            content="Can either party terminate?",
        )
        session.add_all([first_message, second_message])
        session.flush()
        session.add_all(
            [
                ChatAttempt(
                    session_id=setup["session_id"],
                    draft_id=setup["draft_id"],
                    user_message_id=first_message.id,
                    client_request_id="req-db-active-001",
                    status="starting",
                ),
                ChatAttempt(
                    session_id=setup["session_id"],
                    draft_id=setup["draft_id"],
                    user_message_id=second_message.id,
                    client_request_id="req-db-active-002",
                    status="starting",
                ),
            ]
        )

        with pytest.raises(IntegrityError):
            session.commit()


def test_contract_chat_attempt_create_maps_concurrent_active_insert_to_conflict(
    monkeypatch,
    client,
    auth_headers,
    session_factory,
):
    setup = _create_contract_chat_session(client, auth_headers)

    with session_factory() as session:
        existing_message = ChatMessage(
            session_id=setup["session_id"],
            role="user",
            content="What is the liability cap?",
        )
        session.add(existing_message)
        session.flush()
        session.add(
            ChatAttempt(
                session_id=setup["session_id"],
                draft_id=setup["draft_id"],
                user_message_id=existing_message.id,
                client_request_id="req-concurrent-existing",
                status="starting",
            )
        )
        session.commit()

    with session_factory() as session:
        contract = session.get(Document, setup["contract_id"])
        chat_session = session.get(ChatSession, setup["session_id"])
        draft = session.get(DocumentVersion, setup["draft_id"])
        assert contract is not None
        assert chat_session is not None
        assert draft is not None

        original_scalar = session.scalar
        hidden_attempt_selects = 0

        def hide_pre_insert_attempt_checks(*args, **kwargs):
            nonlocal hidden_attempt_selects
            hidden_attempt_selects += 1
            if hidden_attempt_selects <= 2:
                return None
            return original_scalar(*args, **kwargs)

        monkeypatch.setattr(session, "scalar", hide_pre_insert_attempt_checks)

        with pytest.raises(HTTPException) as exc_info:
            contract_chat_attempts.create_attempt(
                session,
                contract=contract,
                chat_session=chat_session,
                draft=draft,
                query="Can either party terminate?",
                client_request_id="req-concurrent-new",
            )

        assert exc_info.value.status_code == 409
        assert exc_info.value.detail == "Chat session already has an active attempt"
        messages = list(
            session.scalars(
                select(ChatMessage)
                .where(ChatMessage.session_id == setup["session_id"])
                .order_by(ChatMessage.id)
            )
        )
        assert [message.content for message in messages] == ["What is the liability cap?"]


def test_contract_chat_attempt_stream_done_persists_assistant_message(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-done-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        stream_body = "".join(response.iter_text())

    assert "event: metadata" in stream_body
    assert "event: status" in stream_body
    assert "event: delta" in stream_body
    assert "event: citations" in stream_body
    assert "event: done" in stream_body
    assert "attempt_id" in stream_body
    assert "sequence" in stream_body
    assert "1,000,000" in stream_body

    messages_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        headers=auth_headers,
    )
    messages = messages_response.json()["data"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert "1,000,000" in messages[1]["content"]


def test_contract_chat_attempt_stream_rejects_completed_attempt_without_duplicate_message(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-repeat-done-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        assert "event: done" in "".join(response.iter_text())

    repeated_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    )
    assert repeated_response.status_code == 409
    assert repeated_response.json()["detail"] == "Chat attempt is already complete"

    messages_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        headers=auth_headers,
    )
    messages = messages_response.json()["data"]
    assert [message["role"] for message in messages] == ["user", "assistant"]


def test_contract_chat_attempt_stream_uses_session_memory(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)

    remember_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        json={"query": "My name is Nguyen Dat Vinh."},
        headers=auth_headers,
    )
    assert remember_response.status_code == 201

    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is my name?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-memory-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        stream_body = "".join(response.iter_text())

    assert "Nguyen Dat Vinh" in stream_body

    event_payloads: dict[str, dict[str, object]] = {}
    for raw_event in stream_body.strip().split("\n\n"):
        lines = raw_event.splitlines()
        event_name = lines[0].removeprefix("event: ").strip()
        payload = json.loads(lines[1].removeprefix("data: ").strip())
        event_payloads[event_name] = payload

    assert event_payloads["citations"]["citations"] == []
    assert event_payloads["done"]["assistant_message"]["provider_used"] == "session-memory"
    assert "Nguyen Dat Vinh" in event_payloads["done"]["assistant_message"]["content"]


def test_contract_chat_attempt_cancel_does_not_persist_assistant_message(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-cancel-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    cancel_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/cancel",
        headers=auth_headers,
    )
    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"]["status"] == "cancelled"

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        stream_body = "".join(response.iter_text())

    assert "event: cancelled" in stream_body

    messages_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        headers=auth_headers,
    )
    messages = messages_response.json()["data"]
    assert [message["role"] for message in messages] == ["user"]


def test_contract_chat_attempt_cancel_allows_retry_superseding_attempt(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-retry-cancel-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    cancel_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/cancel",
        headers=auth_headers,
    )
    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"]["status"] == "cancelled"

    retry_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-retry-cancel-002",
            "supersedes_attempt_id": attempt_id,
        },
        headers=auth_headers,
    )

    assert retry_response.status_code == 201
    assert retry_response.json()["data"]["attempt"]["supersedes_attempt_id"] == attempt_id


def test_contract_chat_attempt_stream_marks_error_when_generation_fails(client, auth_headers, monkeypatch):
    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-error-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    def raise_generation_error(*args, **kwargs):
        raise RuntimeError("simulated generation failure")

    monkeypatch.setattr(contract_chat, "generate_chat_answer", raise_generation_error)

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        stream_body = "".join(response.iter_text())

    assert "event: error" in stream_body
    assert "generation_failed" in stream_body

    attempt_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}",
        headers=auth_headers,
    )
    attempt_payload = attempt_response.json()["data"]
    assert attempt_payload["status"] == "error"
    assert attempt_payload["error_code"] == "generation_failed"

    retry_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-error-retry-001",
            "supersedes_attempt_id": attempt_id,
        },
        headers=auth_headers,
    )
    assert retry_response.status_code == 201


def test_contract_chat_attempt_stream_marks_error_when_persist_fails(client, auth_headers, monkeypatch):
    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-persist-error-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    def raise_persist_error(*args, **kwargs):
        raise RuntimeError("provider secret should not leak")

    monkeypatch.setattr(contract_chat, "persist_assistant_message", raise_persist_error)

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        stream_body = "".join(response.iter_text())

    assert "event: delta" in stream_body
    assert "event: citations" in stream_body
    assert "event: error" in stream_body
    assert "event: done" not in stream_body
    assert "generation_failed" in stream_body
    assert "provider secret should not leak" not in stream_body
    assert "Contract chat generation failed." in stream_body

    attempt_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}",
        headers=auth_headers,
    )
    assert attempt_response.json()["data"]["status"] == "error"

    messages_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        headers=auth_headers,
    )
    messages = messages_response.json()["data"]
    assert [message["role"] for message in messages] == ["user"]


def test_contract_chat_attempt_stream_honors_cancel_after_generation(client, auth_headers, monkeypatch):
    from app.services import contract_chat_attempts

    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-cancel-during-generation-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    def cancel_before_return(session, *, contract, chat_session, query, **kwargs):
        contract_chat_attempts.cancel_attempt(
            session,
            contract=contract,
            chat_session=chat_session,
            attempt_id=attempt_id,
        )
        return contract_chat.ContractChatAnswer(
            content="This answer should not stream.",
            citations=[],
            provider_used="test-provider",
        )

    monkeypatch.setattr(contract_chat, "generate_chat_answer", cancel_before_return)

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        stream_body = "".join(response.iter_text())

    assert "event: cancelled" in stream_body
    assert "This answer should not stream." not in stream_body
    assert "event: done" not in stream_body

    attempt_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}",
        headers=auth_headers,
    )
    assert attempt_response.json()["data"]["status"] == "cancelled"


def test_contract_chat_attempt_stream_honors_cancel_after_citations_before_persist(
    client, auth_headers, session_factory
):
    from app.models import ChatAttempt, ChatSession, Document
    from app.services import contract_chat_attempts, contract_chat_stream

    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-cancel-after-citations-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    with session_factory() as session:
        contract = session.get(Document, setup["contract_id"])
        chat_session = session.get(ChatSession, setup["session_id"])
        attempt = session.get(ChatAttempt, attempt_id)
        stream = contract_chat_stream.stream_attempt(
            session,
            contract=contract,
            chat_session=chat_session,
            attempt=attempt,
        )

        for event in stream:
            if event.startswith("event: citations"):
                contract_chat_attempts.cancel_attempt(
                    session,
                    contract=contract,
                    chat_session=chat_session,
                    attempt_id=attempt_id,
                )
                next_event = next(stream)
                assert next_event.startswith("event: cancelled")
                break
        else:
            raise AssertionError("stream did not emit citations before completion")

    messages_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        headers=auth_headers,
    )
    messages = messages_response.json()["data"]
    assert [message["role"] for message in messages] == ["user"]


def test_contract_chat_attempt_stream_stops_before_llm_when_cancelled_during_retrieval(
    client, auth_headers, monkeypatch
):
    from app.services import contract_chat_attempts

    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-stream-cancel-before-llm-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]
    llm_called = False

    def cancel_during_retrieval(
        session,
        *,
        document_id,
        query,
        limit,
        draft_id=None,
        exclude_block_ids=None,
        should_cancel=None,
    ):
        contract_chat_attempts.cancel_attempt(
            session,
            contract=session.get(contract_chat.Document, document_id),
            chat_session=contract_chat.get_chat_session_or_404(session, setup["session_id"]),
            attempt_id=attempt_id,
        )
        return [
            {
                "block_id": 1,
                "block_key": "blk-test",
                "section_title": "Limitation of Liability",
                "surface_type": "body",
                "surface_key": "body",
                "content": "The liability cap is limited to $1,000,000.",
                "score": 0.99,
            }
        ]

    class FakeChatAdapter:
        def generate_contract_chat_answer(self, payload, **kwargs):
            nonlocal llm_called
            llm_called = True
            return SimpleNamespace(
                content="This provider answer should not be generated.",
                provider_used="fake-provider",
                fallback_used=False,
                error_message=None,
            )

    monkeypatch.setattr(contract_chat.settings, "contract_chat_llm_enabled", True)
    monkeypatch.setattr(contract_chat.rag_service, "retrieve_similar_blocks", cancel_during_retrieval)
    monkeypatch.setattr(contract_chat, "get_llm_adapter", lambda: FakeChatAdapter())

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        stream_body = "".join(response.iter_text())

    assert "event: cancelled" in stream_body
    assert "This provider answer should not be generated." not in stream_body
    assert llm_called is False


def test_contract_chat_attempt_stream_does_not_override_cancel_with_error(client, auth_headers, monkeypatch):
    from app.services import contract_chat_attempts

    setup = _create_contract_chat_session(client, auth_headers)
    create_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-cancel-then-error-001",
        },
        headers=auth_headers,
    )
    attempt_id = create_response.json()["data"]["attempt"]["id"]

    def cancel_then_raise(session, *, contract, chat_session, query, **kwargs):
        contract_chat_attempts.cancel_attempt(
            session,
            contract=contract,
            chat_session=chat_session,
            attempt_id=attempt_id,
        )
        raise RuntimeError("provider failed after cancel")

    monkeypatch.setattr(contract_chat, "generate_chat_answer", cancel_then_raise)

    with client.stream(
        "POST",
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}/stream",
        headers=auth_headers,
    ) as response:
        assert response.status_code == 200
        stream_body = "".join(response.iter_text())

    assert "event: cancelled" in stream_body
    assert "event: error" not in stream_body
    assert "provider failed after cancel" not in stream_body

    attempt_response = client.get(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts/{attempt_id}",
        headers=auth_headers,
    )
    assert attempt_response.json()["data"]["status"] == "cancelled"


def test_contract_chat_attempt_create_respects_streaming_kill_switch(client, auth_headers, monkeypatch):
    from app.core.config import settings

    setup = _create_contract_chat_session(client, auth_headers)
    monkeypatch.setattr(settings, "contract_chat_streaming_enabled", False)

    response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-streaming-disabled-001",
        },
        headers=auth_headers,
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Contract chat streaming is disabled"


def test_contract_chat_rejects_oversized_query_and_request_id(client, auth_headers):
    setup = _create_contract_chat_session(client, auth_headers)

    oversized_query_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "x" * 4001,
            "draft_id": setup["draft_id"],
            "client_request_id": "req-oversized-query-001",
        },
        headers=auth_headers,
    )
    assert oversized_query_response.status_code == 422

    oversized_request_id_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "x" * 121,
        },
        headers=auth_headers,
    )
    assert oversized_request_id_response.status_code == 422

    oversized_json_fallback_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/messages",
        json={"query": "x" * 4001},
        headers=auth_headers,
    )
    assert oversized_json_fallback_response.status_code == 422

    blank_query_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "   ",
            "draft_id": setup["draft_id"],
            "client_request_id": "req-blank-query-001",
        },
        headers=auth_headers,
    )
    assert blank_query_response.status_code == 422

    blank_request_id_response = client.post(
        f"/api/v1/contracts/{setup['contract_id']}/chat/sessions/{setup['session_id']}/attempts",
        json={
            "query": "What is the liability cap?",
            "draft_id": setup["draft_id"],
            "client_request_id": "   ",
        },
        headers=auth_headers,
    )
    assert blank_request_id_response.status_code == 422


def test_contract_chat_context_rejects_weak_evidence():
    weak_blocks = [
        {
            "block_id": 1,
            "block_key": "blk-0001",
            "section_title": "Limitation of Liability",
            "surface_type": "body",
            "surface_key": "body-main",
            "content": "The liability cap is limited to $1,000,000.",
            "score": 0.01,
        },
        {
            "block_id": 2,
            "block_key": "blk-0002",
            "section_title": "Termination",
            "surface_type": "body",
            "surface_key": "body-main",
            "content": "Either party may terminate for material breach with 30 days notice.",
            "score": 0.01,
        },
    ]

    assert contract_chat._select_chat_context("What is the cafeteria menu?", weak_blocks, limit=4) == []


def test_compare_overview_intent_distinguishes_generic_and_topic_specific_questions():
    assert contract_chat._is_compare_overview_query("What changed between the two drafts?") is True
    assert contract_chat._is_compare_overview_query("Summarize the key changes.") is True
    assert contract_chat._is_compare_overview_query("What changed about payment terms?") is False
