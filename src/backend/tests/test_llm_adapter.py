import json

import httpx
import pytest

from app.core.config import Settings
from app.services.llm_adapter import LLMAdapter, ProviderRequestCancelled


def test_adapter_falls_back_to_openai_when_gemini_times_out():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.host or "")
        if request.url.host == "generativelanguage.googleapis.com":
            raise httpx.ReadTimeout("gemini timeout")

        payload = json.loads(request.content.decode("utf-8"))
        assert payload["response_format"] == {"type": "json_object"}

        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "suggested_assignee_user_id": 1,
                                    "recommended_review_status": "in_review",
                                    "explanation": "This change strengthens authentication rules.",
                                    "risk_level": "medium",
                                    "draft_comment": "Please verify the new MFA expectation.",
                                    "suggested_checks": "Review authentication regression tests.",
                                    "confidence": 0.82,
                                }
                            )
                        }
                    }
                ]
            },
        )

    adapter = LLMAdapter(
        settings=_build_ai_settings(),
        client_factory=_build_client_factory(handler),
        max_retries=1,
    )

    result = adapter.generate_ai_review_draft(_sample_payload())

    assert result.provider_used == "openai"
    assert result.fallback_used is True
    assert result.generation_status == "generated"
    assert calls == ["generativelanguage.googleapis.com", "api.openai.com"]


def test_adapter_rejects_resolved_status_and_unknown_assignee():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["generationConfig"]["responseMimeType"] == "application/json"

        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "suggested_assignee_user_id": 9999,
                                            "recommended_review_status": "resolved",
                                            "explanation": "The security requirement now requires MFA.",
                                            "risk_level": "high",
                                            "draft_comment": "Confirm the MFA requirement is implemented.",
                                            "suggested_checks": [
                                                "Review linked security requirements.",
                                                "Run authentication regression tests.",
                                            ],
                                            "confidence": 1.3,
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    adapter = LLMAdapter(
        settings=_build_ai_settings(),
        client_factory=_build_client_factory(handler),
    )

    result = adapter.generate_ai_review_draft(_sample_payload(valid_assignee_ids={1, 2}))

    assert result.provider_used == "gemini"
    assert result.fallback_used is False
    assert result.recommended_review_status == "open"
    assert result.suggested_assignee_user_id is None
    assert result.confidence == 1.0
    assert result.suggested_checks == (
        "Review linked security requirements.\nRun authentication regression tests."
    )


def test_adapter_normalizes_requirement_extraction_candidates():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        prompt = payload["contents"][0]["parts"][0]["text"]
        assert "Redline AI Requirement Extractor" in prompt
        assert "REQ-AUTH-001" in prompt

        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "requirements": [
                                                {
                                                    "requirement_code": "REQ-AUTH-001",
                                                    "title": "Administrator MFA",
                                                    "description": "Admins must use MFA.",
                                                    "source_section": "Functional Requirements",
                                                    "source_block_key": "body-main-block-0001",
                                                    "confidence": 1.4,
                                                },
                                                {
                                                    "requirement_code": "",
                                                    "title": "Missing code should be ignored",
                                                },
                                            ]
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    adapter = LLMAdapter(
        settings=_build_ai_settings(),
        client_factory=_build_client_factory(handler),
    )

    result = adapter.generate_requirement_candidates(
        {
            "document_version_id": 10,
            "parse_run_id": 20,
            "blocks": [
                {
                    "block_key": "body-main-block-0001",
                    "content": "REQ-AUTH-001 The system shall require administrator MFA.",
                }
            ],
        }
    )

    assert result.provider_used == "gemini"
    assert result.fallback_used is False
    assert len(result.candidates) == 1
    assert result.candidates[0].requirement_code == "REQ-AUTH-001"
    assert result.candidates[0].confidence == 1.0


def test_adapter_generates_contract_chat_answer_from_grounded_evidence():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["generationConfig"]["responseMimeType"] == "application/json"
        prompt = payload["contents"][0]["parts"][0]["text"]
        assert "Redline Contract Q&A Assistant" in prompt
        assert "liability cap" in prompt
        assert "cite it inline" in prompt

        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "answer": "The liability cap is $1,000,000 [1].",
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    adapter = LLMAdapter(
        settings=_build_ai_settings(),
        client_factory=_build_client_factory(handler),
    )

    result = adapter.generate_contract_chat_answer(
        {
            "question": "What is the liability cap?",
            "contract": {"title": "Vendor NDA"},
            "recent_messages": [],
            "evidence": [
                {
                    "citation_number": 1,
                    "section_title": "Limitation of Liability",
                    "content": "The liability cap is limited to $1,000,000.",
                }
            ],
        }
    )

    assert result.provider_used == "gemini"
    assert result.fallback_used is False
    assert result.error_message is None
    assert result.content == "The liability cap is $1,000,000 [1]."


def test_contract_chat_answer_honors_cancel_before_provider_call():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.host or "")
        return httpx.Response(500, json={})

    adapter = LLMAdapter(
        settings=_build_ai_settings(),
        client_factory=_build_client_factory(handler),
    )

    with pytest.raises(ProviderRequestCancelled):
        adapter.generate_contract_chat_answer(
            {
                "question": "What is the liability cap?",
                "contract": {"title": "Vendor NDA"},
                "recent_messages": [],
                "evidence": [],
            },
            should_cancel=lambda: True,
        )

    assert calls == []


def _build_ai_settings() -> Settings:
    return Settings(
        ai_primary_provider="gemini",
        ai_gemini_api_key="gemini-test-key",
        ai_gemini_model="gemini-2.5-flash",
        ai_fallback_provider="openai",
        ai_openai_api_key="openai-test-key",
        ai_openai_model="gpt-4.1-mini",
        ai_openai_base_url="https://api.openai.com/v1",
    )


def _sample_payload(valid_assignee_ids: set[int] | None = None) -> dict[str, object]:
    return {
        "change_item_id": 101,
        "valid_assignee_ids": valid_assignee_ids or {1, 2},
        "change_item": {
            "change_type": "modified",
            "section_title": "Authentication",
            "old_content": "Users log in with username and password.",
            "new_content": "Users log in with username, password, and MFA.",
        },
        "linked_requirements": [],
        "impacted_tests": [],
        "recent_comments": [],
        "project_members": [
            {"user_id": 1, "display_name": "Vinh"},
            {"user_id": 2, "display_name": "My"},
        ],
    }


def _build_client_factory(handler):
    transport = httpx.MockTransport(handler)

    def factory(*, timeout: float) -> httpx.Client:
        return httpx.Client(transport=transport, timeout=timeout)

    return factory


def test_adapter_retries_on_transient_error_then_succeeds():
    """Verify that the adapter retries a transient 503 and succeeds on the next attempt."""
    calls: list[str] = []
    attempt_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempt_count
        calls.append(request.url.host or "")

        if request.url.host == "generativelanguage.googleapis.com":
            attempt_count += 1
            if attempt_count == 1:
                return httpx.Response(503, json={"error": {"message": "Service Unavailable"}})
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json.dumps(
                                            {
                                                "suggested_assignee_user_id": 1,
                                                "recommended_review_status": "open",
                                                "explanation": "Retry succeeded.",
                                                "risk_level": "low",
                                            }
                                        )
                                    }
                                ]
                            }
                        }
                    ]
                },
            )
        return httpx.Response(500, json={})

    adapter = LLMAdapter(
        settings=_build_ai_settings(),
        client_factory=_build_client_factory(handler),
        max_retries=3,
        retry_base_delay=0.01,
    )

    result = adapter.generate_ai_review_draft(_sample_payload())

    assert result.provider_used == "gemini"
    assert result.fallback_used is False
    assert result.generation_status == "generated"
    assert result.explanation == "Retry succeeded."
    assert calls == [
        "generativelanguage.googleapis.com",
        "generativelanguage.googleapis.com",
    ]


def test_adapter_exhausts_retries_then_falls_back():
    """Verify that all retries for Gemini are exhausted before falling back to OpenAI."""
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.host or "")
        if request.url.host == "generativelanguage.googleapis.com":
            return httpx.Response(503, json={"error": {"message": "Service Unavailable"}})
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "suggested_assignee_user_id": 2,
                                    "recommended_review_status": "open",
                                    "explanation": "Fallback after retries.",
                                }
                            )
                        }
                    }
                ]
            },
        )

    adapter = LLMAdapter(
        settings=_build_ai_settings(),
        client_factory=_build_client_factory(handler),
        max_retries=2,
        retry_base_delay=0.01,
    )

    result = adapter.generate_ai_review_draft(_sample_payload())

    assert result.provider_used == "openai"
    assert result.fallback_used is True
    assert result.generation_status == "generated"
    assert result.explanation == "Fallback after retries."
    assert calls == [
        "generativelanguage.googleapis.com",
        "generativelanguage.googleapis.com",
        "api.openai.com",
    ]
