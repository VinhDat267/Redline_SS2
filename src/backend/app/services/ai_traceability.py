"""AI-powered traceability suggestion service.

Analyzes a ChangeItem against all project Requirement objects and returns
a ranked list of suggested obligations ranked by semantic relevance,
using the existing LLMAdapter provider chain (Gemini → OpenAI fallback).
"""
from __future__ import annotations

import hashlib
import hmac
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChangeItem, Requirement
from app.services.llm_adapter import LLMAdapter, NormalizedTraceabilitySuggestionResult


_MAX_REQUIREMENTS_IN_PROMPT = 100  # guard against absurdly large projects


def get_llm_adapter() -> LLMAdapter:
    return LLMAdapter()


def suggest_traceability_links(
    session: Session,
    change_item_id: int,
    *,
    adapter: LLMAdapter | None = None,
) -> dict[str, Any]:
    """Return AI-ranked obligation suggestions for a given change item.

    The result is intentionally ephemeral (not persisted). Accepted
    suggestions are committed by the caller via the existing
    ``create_requirement_link`` service with ``link_type="ai_suggested"``.
    """
    change_item = _get_change_item_or_404(session, change_item_id)
    project_id = _get_project_id(change_item)

    requirements = _load_project_requirements(session, project_id)
    if not requirements:
        return {
            "suggestions": [],
            "provider_used": None,
            "fallback_used": False,
            "error_message": "No obligations found for this project.",
        }

    # Pre-filter by section match first (cheap heuristic) to reduce token use
    section = change_item.section_title or ""
    section_matched = [
        r for r in requirements
        if section and r.source_section and section.lower() in r.source_section.lower()
    ] if section else []

    # If section matching gives a useful subset, prefer it; otherwise use all
    if len(section_matched) >= 3:
        candidates = section_matched[:_MAX_REQUIREMENTS_IN_PROMPT]
    else:
        candidates = requirements[:_MAX_REQUIREMENTS_IN_PROMPT]

    payload = _build_suggestion_payload(change_item, candidates)
    result: NormalizedTraceabilitySuggestionResult = (adapter or get_llm_adapter()).generate_traceability_suggestions(payload)

    # Map requirement_code → requirement_id for the frontend (safer than trusting LLM with IDs)
    code_to_id: dict[str, int] = {r.requirement_code: r.id for r in candidates}
    enriched: list[dict[str, Any]] = []
    for suggestion in result.suggestions:
        req_id = code_to_id.get(suggestion.requirement_code)
        if req_id is None:
            # AI hallucinated a code not in our list — discard
            continue
        enriched.append({
            "requirement_id": req_id,
            "requirement_code": suggestion.requirement_code,
            "title": suggestion.title,
            "confidence": suggestion.confidence,
            "rationale": suggestion.rationale,
            "relevance_type": suggestion.relevance_type,
            "suggestion_token": build_suggestion_token(change_item_id, req_id),
        })

    return {
        "suggestions": enriched,
        "provider_used": result.provider_used,
        "fallback_used": result.fallback_used,
        "error_message": result.error_message,
    }


def build_suggestion_token(change_item_id: int, requirement_id: int) -> str:
    message = f"traceability-suggestion:{change_item_id}:{requirement_id}".encode("utf-8")
    return hmac.new(settings.auth_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_suggestion_token(
    session: Session,
    *,
    change_item_id: int,
    requirement_id: int,
    suggestion_token: str,
) -> None:
    _get_change_item_or_404(session, change_item_id)
    if session.get(Requirement, requirement_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")
    expected = build_suggestion_token(change_item_id, requirement_id)
    if not hmac.compare_digest(expected, suggestion_token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid AI suggestion token")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_change_item_or_404(session: Session, change_item_id: int) -> ChangeItem:
    change_item = session.get(ChangeItem, change_item_id)
    if change_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change item not found")
    return change_item


def _get_project_id(change_item: ChangeItem) -> int:
    return change_item.source_version.document.project_id


def _load_project_requirements(session: Session, project_id: int) -> list[Requirement]:
    from app.models import Document
    return list(
        session.scalars(
            select(Requirement)
            .join(Document, Document.id == Requirement.document_id)
            .where(Document.project_id == project_id)
            .where(Requirement.status == "active")
            .order_by(Requirement.requirement_code)
        )
    )


def _build_suggestion_payload(
    change_item: ChangeItem,
    requirements: list[Requirement],
) -> dict[str, Any]:
    return {
        "task": "traceability_suggestion",
        "change": {
            "change_type": change_item.change_type,
            "section_title": change_item.section_title,
            "surface_type": change_item.surface_type,
            "old_content": change_item.old_content,
            "new_content": change_item.new_content,
        },
        "obligations": [
            {
                "requirement_code": r.requirement_code,
                "title": r.title,
                "description": r.description or "",
                "source_section": r.source_section or "",
            }
            for r in requirements
        ],
        "guidance": (
            "Analyze the contract clause change above. "
            "For each obligation in the list, determine if the change "
            "directly or indirectly affects that obligation. "
            "Return only obligations that are genuinely related (confidence >= 0.30)."
        ),
    }
