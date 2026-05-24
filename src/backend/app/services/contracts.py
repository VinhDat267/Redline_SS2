from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import ChatMessage, ChatSession, Document, DocumentVersion
from app.schemas.document import DocumentCreate, DocumentUpdate
from app.schemas.document_version import DocumentVersionUpdate
from app.schemas.compare import ChangeItemDetailRead
from app.services import change_items as change_item_service
from app.services import documents as document_service


def create_contract(session: Session, project_id: int, *, title: str, contract_type: str | None, description: str | None) -> Document:
    return document_service.create_document(
        session,
        project_id,
        payload=DocumentCreate(
            title=title,
            document_type=contract_type,
            description=description,
        ),
    )


def update_contract(session: Session, contract: Document, *, title: str | None, contract_type: str | None, description: str | None) -> Document:
    return document_service.update_document(
        session,
        contract,
        payload=DocumentUpdate(
            title=title,
            document_type=contract_type,
            description=description,
        ),
    )


def serialize_contract(contract: Document) -> dict[str, object]:
    return {
        "id": contract.id,
        "project_id": contract.project_id,
        "title": contract.title,
        "contract_type": contract.document_type,
        "description": contract.description,
        "created_at": contract.created_at,
        "updated_at": contract.updated_at,
    }


def serialize_contract_draft(draft: DocumentVersion) -> dict[str, object]:
    return {
        "id": draft.id,
        "contract_id": draft.document_id,
        "draft_label": draft.version_label,
        "file_name": draft.file_name,
        "file_path": draft.file_path,
        "uploaded_by_user_id": draft.uploaded_by_user_id,
        "parse_status": draft.parse_status,
        "parsed_snapshot": draft.parsed_snapshot,
        "uploaded_at": draft.uploaded_at,
        "notes": draft.notes,
        "uploaded_by_display_name": draft.uploaded_by_display_name,
        "active_parse_run_id": draft.active_parse_run_id,
        "warning_count": draft.warning_count,
        "parser_version": draft.parser_version,
    }


def build_contract_draft_update(payload) -> DocumentVersionUpdate:
    return DocumentVersionUpdate(
        version_label=payload.draft_label,
        notes=payload.notes,
    )


def serialize_contract_compare_run(compare_run_detail: dict[str, object]) -> dict[str, object]:
    return {
        "id": compare_run_detail["id"],
        "compare_version": compare_run_detail["compare_version"],
        "compare_status": compare_run_detail["compare_status"],
        "started_at": compare_run_detail["started_at"],
        "completed_at": compare_run_detail["completed_at"],
        "source_parse_run_id": compare_run_detail["source_parse_run_id"],
        "target_parse_run_id": compare_run_detail["target_parse_run_id"],
        "is_stale": compare_run_detail["is_stale"],
        "warning_count": compare_run_detail["warning_count"],
        "warnings": compare_run_detail["warnings"],
        "contract": {
            "id": compare_run_detail["document"]["id"],
            "project_id": compare_run_detail["document"]["project_id"],
            "title": compare_run_detail["document"]["title"],
            "contract_type": compare_run_detail["document"]["document_type"],
            "description": compare_run_detail["document"]["description"],
            "created_at": None,
            "updated_at": None,
        },
        "source_draft": {
            "id": compare_run_detail["source_version"]["id"],
            "contract_id": compare_run_detail["source_version"]["document_id"],
            "draft_label": compare_run_detail["source_version"]["version_label"],
            "file_name": "",
            "file_path": "",
            "uploaded_by_user_id": None,
            "parse_status": compare_run_detail["source_version"]["parse_status"],
            "parsed_snapshot": None,
            "uploaded_at": compare_run_detail["started_at"],
            "notes": None,
            "uploaded_by_display_name": None,
            "active_parse_run_id": compare_run_detail["source_version"]["active_parse_run_id"],
            "warning_count": compare_run_detail["source_version"]["warning_count"],
            "parser_version": compare_run_detail["source_version"]["parser_version"],
        },
        "target_draft": {
            "id": compare_run_detail["target_version"]["id"],
            "contract_id": compare_run_detail["target_version"]["document_id"],
            "draft_label": compare_run_detail["target_version"]["version_label"],
            "file_name": "",
            "file_path": "",
            "uploaded_by_user_id": None,
            "parse_status": compare_run_detail["target_version"]["parse_status"],
            "parsed_snapshot": None,
            "uploaded_at": compare_run_detail["started_at"],
            "notes": None,
            "uploaded_by_display_name": None,
            "active_parse_run_id": compare_run_detail["target_version"]["active_parse_run_id"],
            "warning_count": compare_run_detail["target_version"]["warning_count"],
            "parser_version": compare_run_detail["target_version"]["parser_version"],
        },
        "summary": compare_run_detail["summary"],
        "selected_clause_change_id": compare_run_detail["selected_change_item_id"],
        "has_ai_clause_risk_analyses": compare_run_detail["has_ai_review_drafts"],
    }


def serialize_clause_change(item: dict[str, object]) -> dict[str, object]:
    return {
        "id": item["id"],
        "compare_run_id": item["compare_run_id"],
        "change_type": item["change_type"],
        "review_status": item["review_status"],
        "clause_title": item["section_title"],
        "surface_type": item["surface_type"],
        "surface_key": item["surface_key"],
        "container_type": item["container_type"],
        "container_key": item["container_key"],
        "table_key": item["table_key"],
        "row_key": item["row_key"],
        "old_text": item["old_content"],
        "new_text": item["new_content"],
        "summary": item["summary"],
        "ai_generation_status": item["ai_generation_status"],
        "has_ai_clause_risk_analysis": item["has_ai_review_draft"],
        "sort_key": item["sort_key"],
    }


def serialize_chat_session(chat_session: ChatSession) -> dict[str, object]:
    return {
        "id": chat_session.id,
        "contract_id": chat_session.contract_id,
        "draft_id": chat_session.draft_id,
        "compare_run_id": chat_session.compare_run_id,
        "scope_type": "compare_run" if chat_session.compare_run_id is not None else "draft",
        "title": chat_session.title,
        "created_by_user_id": chat_session.created_by_user_id,
        "created_at": chat_session.created_at,
        "updated_at": chat_session.updated_at,
    }


def serialize_chat_message(chat_message: ChatMessage) -> dict[str, object]:
    detail = _parse_citations(chat_message.citations_json)
    return {
        "id": chat_message.id,
        "role": chat_message.role,
        "content": chat_message.content,
        "citations": detail,
        "provider_used": chat_message.provider_used,
        "created_at": chat_message.created_at,
        "updated_at": chat_message.updated_at,
    }


def get_clause_change_detail(session: Session, change_item_id: int) -> dict[str, object]:
    detail = change_item_service.get_change_item_detail(session, change_item_id)
    mapped = ChangeItemDetailRead.model_validate(detail).model_dump(mode="json")
    mapped["clause_title"] = mapped.pop("section_title")
    mapped["old_text"] = mapped.pop("old_content")
    mapped["new_text"] = mapped.pop("new_content")
    mapped["ai_clause_risk_analysis"] = mapped.pop("ai_review_draft")
    return mapped


def ensure_contract_draft_belongs_to_contract(contract: Document, draft: DocumentVersion) -> None:
    if draft.document_id != contract.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract draft not found")


def _parse_citations(citations_json: str | None) -> list[dict[str, object]]:
    if not citations_json:
        return []
    import json

    try:
        payload = json.loads(citations_json)
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else []
