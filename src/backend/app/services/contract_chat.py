from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Callable, Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models import ChangeItem, ChatMessage, ChatSession, CompareRun, Document, DocumentBlock, DocumentVersion
from app.services import compare as compare_service
from app.services import rag_service
from app.services.llm_adapter import LLMAdapter, ProviderRequestCancelled


_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")
_CHAT_RETRIEVAL_LIMIT = 16
_CHAT_CONTEXT_LIMIT = 4
_CHAT_MEMORY_HISTORY_LIMIT = 12
_CHAT_LLM_HISTORY_LIMIT = 8
_CHAT_CONTEXT_MIN_SCORE = 1.0
_SEMANTIC_SCORE_WEIGHT = 2.0
_PARSED_DRAFT_STATUSES = {"parsed", "parsed_with_warnings"}
_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "can",
    "do",
    "does",
    "for",
    "from",
    "gi",
    "is",
    "la",
    "me",
    "my",
    "of",
    "or",
    "the",
    "this",
    "to",
    "toi",
    "what",
    "which",
    "who",
    "you",
}
logger = logging.getLogger(__name__)
_NAME_DECLARATION_PATTERNS = (
    re.compile(r"(?:my\s+name\s+is|call\s+me)\s+([^.!?\n]+)", re.IGNORECASE),
    re.compile(r"(?:tôi|toi)\s+(?:tên|ten)\s+là\s+([^.!?\n]+)", re.IGNORECASE),
    re.compile(r"(?:tên|ten)\s+(?:tôi|toi)\s+là\s+([^.!?\n]+)", re.IGNORECASE),
)
_NAME_RECALL_TRIGGERS = (
    "what is my name",
    "what's my name",
    "who am i",
    "tôi tên là gì",
    "toi ten la gi",
    "tên tôi là gì",
    "ten toi la gi",
)
_QUERY_EXPANSIONS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("liability", "cap", "damages"), "limitation liability damages capped cap fees"),
    (("confidential", "obligation"), "confidentiality obligations continue years disclosure"),
    (("independent", "exclusion"), "exclusions independently developed exclusion removed"),
    (("terminate", "termination", "notice"), "termination terminate recipient convenience days notice"),
    (("deliverable", "deliverables"), "deliverables workshop prototype api integration guide checklist"),
    (("accept", "accepted", "acceptance"), "acceptance deliverables deemed accepted business days defect evidence"),
    (("payment", "invoice", "fees"), "payment fees due upfront payable invoice"),
    (("own", "owns", "ownership", "license"), "ip ownership vendor retains deliverables non exclusive internal use license"),
)


@dataclass(slots=True)
class ContractChatAnswer:
    content: str
    citations: list[dict[str, object]]
    provider_used: str


class ChatGenerationCancelled(Exception):
    pass


def get_llm_adapter() -> LLMAdapter:
    return LLMAdapter()


def list_chat_sessions(session: Session, contract_id: int) -> list[ChatSession]:
    return list(
        session.scalars(
            select(ChatSession)
            .where(ChatSession.contract_id == contract_id)
            .order_by(ChatSession.id)
        )
    )


def list_chat_messages(session: Session, chat_session_id: int) -> list[ChatMessage]:
    return list(
        session.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == chat_session_id)
            .order_by(ChatMessage.id)
        )
    )


def create_chat_session(
    session: Session,
    *,
    contract: Document,
    draft: DocumentVersion,
    compare_run: CompareRun | None = None,
    created_by_user_id: int,
    title: str | None,
) -> ChatSession:
    if draft.parse_status not in _PARSED_DRAFT_STATUSES or draft.active_parse_run_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Contract draft must be parsed successfully before starting chat",
        )
    if compare_run is not None:
        _ensure_compare_run_belongs_to_contract(contract, compare_run)
        ensure_compare_run_is_current(session, compare_run)
        if compare_run.target_version_id != draft.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Compare Q&A must use the compare run target draft as the session draft",
            )

    chat_session = ChatSession(
        contract_id=contract.id,
        draft_id=draft.id,
        compare_run_id=compare_run.id if compare_run is not None else None,
        created_by_user_id=created_by_user_id,
        title=title,
    )
    session.add(chat_session)
    session.commit()
    session.refresh(chat_session)
    return chat_session


def ensure_chat_session_draft_is_parsed(session: Session, chat_session: ChatSession) -> None:
    draft = chat_session.draft or session.get(DocumentVersion, chat_session.draft_id)
    if draft is None or draft.parse_status not in _PARSED_DRAFT_STATUSES or draft.active_parse_run_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Contract draft must be parsed successfully before asking questions",
        )


def get_chat_session_or_404(session: Session, chat_session_id: int) -> ChatSession:
    chat_session = session.scalar(
        select(ChatSession)
        .where(ChatSession.id == chat_session_id)
        .options(joinedload(ChatSession.messages))
    )
    if chat_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    return chat_session


def create_chat_exchange(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    query: str,
) -> dict[str, object]:
    _ensure_chat_session_belongs_to_contract(contract, chat_session)
    ensure_chat_session_draft_is_parsed(session, chat_session)
    ensure_chat_session_compare_run_is_current(session, chat_session)
    answer = generate_chat_answer(
        session,
        contract=contract,
        chat_session=chat_session,
        query=query,
    )
    user_message, assistant_message = persist_chat_exchange(
        session,
        chat_session=chat_session,
        query=query,
        answer=answer,
    )

    return {
        "session_id": chat_session.id,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }


def generate_chat_answer(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    query: str,
    should_cancel: Callable[[], bool] | None = None,
) -> ContractChatAnswer:
    _raise_if_cancelled(should_cancel)
    _ensure_chat_session_belongs_to_contract(contract, chat_session)
    ensure_chat_session_draft_is_parsed(session, chat_session)
    ensure_chat_session_compare_run_is_current(session, chat_session)

    memory_answer = _build_session_memory_answer(
        session,
        chat_session=chat_session,
        query=query,
    )
    if memory_answer is not None:
        _raise_if_cancelled(should_cancel)
        return memory_answer

    metadata_answer = _build_contract_metadata_answer(
        session,
        contract=contract,
        chat_session=chat_session,
        query=query,
    )
    if metadata_answer is not None:
        _raise_if_cancelled(should_cancel)
        return metadata_answer

    if chat_session.compare_run_id is not None:
        compare_answer = _build_compare_run_answer(
            session,
            contract=contract,
            chat_session=chat_session,
            query=query,
            should_cancel=should_cancel,
        )
        if compare_answer is not None:
            _raise_if_cancelled(should_cancel)
            return compare_answer

    _raise_if_cancelled(should_cancel)
    try:
        retrieved_blocks = rag_service.retrieve_similar_blocks(
            session,
            document_id=contract.id,
            draft_id=chat_session.draft_id,
            query=query,
            limit=_CHAT_RETRIEVAL_LIMIT,
            should_cancel=should_cancel,
        )
    except rag_service.RetrievalCancelled as exc:
        raise ChatGenerationCancelled() from exc
    _raise_if_cancelled(should_cancel)
    context_blocks = _select_chat_context(query, retrieved_blocks, limit=_CHAT_CONTEXT_LIMIT)

    if context_blocks:
        _raise_if_cancelled(should_cancel)
        return _build_grounded_rag_answer(
            session,
            contract=contract,
            chat_session=chat_session,
            query=query,
            context_blocks=context_blocks,
            should_cancel=should_cancel,
        )
    else:
        answer_text = "I couldn't find a relevant answer in the current contract draft. Try rephrasing your question."

    return ContractChatAnswer(
        content=answer_text,
        citations=_serialize_citations(context_blocks),
        provider_used="local-rag",
    )


def persist_chat_exchange(
    session: Session,
    *,
    chat_session: ChatSession,
    query: str,
    answer: ContractChatAnswer,
) -> tuple[ChatMessage, ChatMessage]:
    user_message = ChatMessage(
        session_id=chat_session.id,
        role="user",
        content=query,
        citations_json=None,
        provider_used=answer.provider_used,
    )
    assistant_message = ChatMessage(
        session_id=chat_session.id,
        role="assistant",
        content=answer.content,
        citations_json=json.dumps(
            answer.citations,
            separators=(",", ":"),
            ensure_ascii=True,
        ),
        provider_used=answer.provider_used,
    )
    session.add_all([user_message, assistant_message])
    session.commit()
    session.refresh(user_message)
    session.refresh(assistant_message)

    return user_message, assistant_message


def persist_assistant_message(
    session: Session,
    *,
    chat_session: ChatSession,
    answer: ContractChatAnswer,
) -> ChatMessage:
    assistant_message = ChatMessage(
        session_id=chat_session.id,
        role="assistant",
        content=answer.content,
        citations_json=json.dumps(
            answer.citations,
            separators=(",", ":"),
            ensure_ascii=True,
        ),
        provider_used=answer.provider_used,
    )
    session.add(assistant_message)
    session.commit()
    session.refresh(assistant_message)
    return assistant_message


def iter_sse_chunks(
    content: str,
    *,
    chunk_size: int = 28,
) -> Iterable[str]:
    if not content:
        return [""]

    return [
        content[index : index + chunk_size]
        for index in range(0, len(content), chunk_size)
    ]


def _ensure_chat_session_belongs_to_contract(contract: Document, chat_session: ChatSession) -> None:
    if chat_session.contract_id != contract.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")


def _ensure_compare_run_belongs_to_contract(contract: Document, compare_run: CompareRun) -> None:
    source_version = compare_run.source_version
    target_version = compare_run.target_version
    if source_version is None or target_version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")
    if source_version.document_id != contract.id or target_version.document_id != contract.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")


def ensure_compare_run_is_current(session: Session, compare_run: CompareRun) -> None:
    if compare_service.is_compare_run_stale(compare_run):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Compare run is stale because one of its drafts was parsed again. Run Compare again before starting compare Q&A.",
        )
    if compare_service.is_compare_run_superseded(session, compare_run):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Compare run is superseded by a newer run for the same draft pair. "
                "Use the latest Compare run before asking compare Q&A."
            ),
        )


def ensure_chat_session_compare_run_is_current(session: Session, chat_session: ChatSession) -> None:
    if chat_session.compare_run_id is None:
        return
    compare_run = session.scalar(
        select(CompareRun)
        .where(CompareRun.id == chat_session.compare_run_id)
        .options(
            joinedload(CompareRun.source_version),
            joinedload(CompareRun.target_version),
        )
    )
    if compare_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")
    ensure_compare_run_is_current(session, compare_run)


def _build_session_memory_answer(
    session: Session,
    *,
    chat_session: ChatSession,
    query: str,
) -> ContractChatAnswer | None:
    vietnamese_query = _is_vietnamese_name_query(query)

    if _is_name_recall_query(query):
        remembered_name = _find_latest_declared_name(session, chat_session.id, current_query=query)
        if remembered_name:
            return ContractChatAnswer(
                content=(
                    f"Bạn đã nói tên của bạn là {remembered_name}."
                    if vietnamese_query
                    else f"You told me your name is {remembered_name}."
                ),
                citations=[],
                provider_used="session-memory",
            )

        return ContractChatAnswer(
            content=(
                "Tôi chưa có tên của bạn trong chat session này."
                if vietnamese_query
                else "I do not have your name in this chat session yet."
            ),
            citations=[],
            provider_used="session-memory",
        )

    declared_name = _extract_declared_name(query)
    if declared_name:
        return ContractChatAnswer(
            content=(
                f"Tôi sẽ nhớ tên của bạn là {declared_name}."
                if vietnamese_query
                else f"I will remember that your name is {declared_name}."
            ),
            citations=[],
            provider_used="session-memory",
        )

    return None


def _build_compare_run_answer(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    query: str,
    should_cancel: Callable[[], bool] | None = None,
) -> ContractChatAnswer | None:
    _raise_if_cancelled(should_cancel)
    compare_run = session.scalar(
        select(CompareRun)
        .where(CompareRun.id == chat_session.compare_run_id)
        .options(
            joinedload(CompareRun.source_version),
            joinedload(CompareRun.target_version),
        )
    )
    if compare_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")
    _ensure_compare_run_belongs_to_contract(contract, compare_run)

    change_items = list(
        session.scalars(
            select(ChangeItem)
            .where(ChangeItem.compare_run_id == compare_run.id)
            .options(
                joinedload(ChangeItem.source_block).joinedload(DocumentBlock.surface),
                joinedload(ChangeItem.target_block).joinedload(DocumentBlock.surface),
            )
        )
    )
    if not change_items:
        return ContractChatAnswer(
            content=(
                "No changes were found between these two versions. "
                "The documents appear to be identical."
            ),
            citations=[],
            provider_used="local-compare",
        )

    selected = _select_compare_change_items(query, change_items, limit=_CHAT_CONTEXT_LIMIT)
    if not selected:
        if _is_compare_overview_query(query):
            selected = change_items[:_CHAT_CONTEXT_LIMIT]
        else:
            return ContractChatAnswer(
                content="The comparison doesn't contain enough information to answer that question. Try asking about specific clauses.",
                citations=[],
                provider_used="local-compare",
            )

    source_label = compare_run.source_version.version_label
    target_label = compare_run.target_version.version_label
    citations = _serialize_compare_citations(selected, compare_run_id=compare_run.id)
    if settings.contract_chat_llm_enabled and citations:
        llm_answer = _try_generate_llm_compare_answer(
            session,
            contract=contract,
            chat_session=chat_session,
            compare_run=compare_run,
            query=query,
            change_items=selected,
            citations=citations,
            should_cancel=should_cancel,
        )
        if llm_answer is not None:
            return ContractChatAnswer(
                content=llm_answer["content"],
                citations=citations,
                provider_used=llm_answer["provider_used"],
            )

    lines = [
        f"Here are the changes between {source_label} and {target_label}:",
    ]
    for index, change_item in enumerate(selected, start=1):
        title = change_item.section_title or f"Change item {change_item.id}"
        lines.append(f"{index}. {title} ({change_item.change_type}):")
        if change_item.old_content:
            lines.append(f"   Source {source_label}: {change_item.old_content}")
        if change_item.new_content:
            lines.append(f"   Target {target_label}: {change_item.new_content}")
        if change_item.review_status:
            lines.append(f"   Review status: {change_item.review_status}.")

    return ContractChatAnswer(
        content="\n".join(lines),
        citations=citations,
        provider_used="local-compare",
    )


def _try_generate_llm_compare_answer(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    compare_run: CompareRun,
    query: str,
    change_items: list[ChangeItem],
    citations: list[dict[str, object]],
    should_cancel: Callable[[], bool] | None = None,
) -> dict[str, str] | None:
    _raise_if_cancelled(should_cancel)
    payload = _build_compare_chat_llm_payload(
        session,
        contract=contract,
        chat_session=chat_session,
        compare_run=compare_run,
        query=query,
        change_items=change_items,
        citations=citations,
    )
    try:
        _raise_if_cancelled(should_cancel)
        generated = get_llm_adapter().generate_contract_chat_answer(
            payload,
            should_cancel=should_cancel,
        )
        _raise_if_cancelled(should_cancel)
    except ProviderRequestCancelled as exc:
        raise ChatGenerationCancelled() from exc
    except Exception:
        logger.exception("Compare Q&A LLM synthesis failed unexpectedly; falling back to local compare answer.")
        return None

    if generated.error_message or not generated.content.strip():
        return None
    return {
        "content": generated.content.strip(),
        "provider_used": f"{generated.provider_used}:contract-chat",
    }


def _build_compare_chat_llm_payload(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    compare_run: CompareRun,
    query: str,
    change_items: list[ChangeItem],
    citations: list[dict[str, object]],
) -> dict[str, object]:
    return {
        "contract": {
            "title": contract.title,
            "document_type": contract.document_type,
            "description": contract.description,
            "source_draft_label": compare_run.source_version.version_label,
            "target_draft_label": compare_run.target_version.version_label,
            "compare_run_id": compare_run.id,
        },
        "question": query,
        "recent_messages": _build_recent_conversation_messages(
            session,
            chat_session_id=chat_session.id,
            current_query=query,
        ),
        "changes": [
            {
                "change_item_id": item.id,
                "change_type": item.change_type,
                "review_status": item.review_status,
                "section_title": item.section_title,
                "summary": item.summary,
                "source_content": item.old_content,
                "target_content": item.new_content,
            }
            for item in change_items
        ],
        "evidence": [
            {
                "citation_number": index,
                "source_label": item.get("source_label"),
                "change_item_id": item.get("change_item_id"),
                "section_title": item.get("section_title"),
                "block_key": item.get("block_key"),
                "surface_type": item.get("surface_type"),
                "surface_key": item.get("surface_key"),
                "content": item.get("content"),
            }
            for index, item in enumerate(citations, start=1)
        ],
        "instructions": {
            "truth_boundary": (
                "Use only the supplied compare metadata, structured changes, recent conversation, and source/target evidence. "
                "Do not invent changes or rely on outside contract knowledge."
            ),
            "citation_style": "When relying on source/target evidence, cite it inline as [citation_number].",
            "fallback": "If the compare evidence does not answer the question, say the compare run does not contain enough grounded evidence.",
        },
    }


def _select_compare_change_items(
    query: str,
    change_items: list[ChangeItem],
    *,
    limit: int,
) -> list[ChangeItem]:
    query_tokens = set(_tokenize(_expand_query(query)))
    scored: list[tuple[float, int, ChangeItem]] = []
    for index, change_item in enumerate(change_items):
        haystack = " ".join(
            value
            for value in (
                change_item.section_title,
                change_item.change_type,
                change_item.old_content,
                change_item.new_content,
                change_item.summary,
            )
            if value
        ).lower()
        score = 0.0
        for token in query_tokens:
            if token in haystack:
                score += 1.0
        if change_item.section_title and any(token in change_item.section_title.lower() for token in query_tokens):
            score += 1.0
        if score > 0:
            scored.append((score, index, change_item))

    if not scored:
        return []
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [item for _score, _index, item in scored[:limit]]


def _is_compare_overview_query(query: str) -> bool:
    normalized = _normalize_query_for_intent(query)
    if not normalized:
        return False

    query_tokens = set(_tokenize(normalized))
    overview_phrases = (
        "what changed",
        "what are the changes",
        "summarize changes",
        "summary of changes",
        "summarize the differences",
        "what are the differences",
        "difference between",
        "differences between",
        "compare these drafts",
        "compare the drafts",
        "compare two drafts",
        "thay doi gi",
        "co gi thay doi",
        "khac nhau gi",
        "diem khac nhau",
        "tom tat thay doi",
    )
    generic_tokens = {
        "about",
        "all",
        "any",
        "brief",
        "briefly",
        "change",
        "changed",
        "changes",
        "co",
        "compare",
        "compared",
        "comparison",
        "difference",
        "differences",
        "diem",
        "draft",
        "drafts",
        "between",
        "how",
        "it",
        "key",
        "main",
        "major",
        "two",
        "thay",
        "doi",
        "khac",
        "nhau",
        "summary",
        "summarize",
        "tom",
        "tat",
        "version",
        "versions",
    }
    if not query_tokens or not query_tokens <= generic_tokens:
        return False
    overview_markers = {
        "change",
        "changed",
        "changes",
        "compare",
        "compared",
        "comparison",
        "difference",
        "differences",
        "summary",
        "summarize",
        "thay",
        "doi",
        "khac",
        "nhau",
        "tom",
        "tat",
    }
    return any(phrase in normalized for phrase in overview_phrases) or bool(query_tokens & overview_markers)


def _find_latest_declared_name(session: Session, chat_session_id: int, *, current_query: str) -> str | None:
    messages = list_chat_messages(session, chat_session_id)
    if messages and messages[-1].role == "user" and messages[-1].content == current_query:
        messages = messages[:-1]

    recent_messages = messages[-_CHAT_MEMORY_HISTORY_LIMIT:]
    for message in reversed(recent_messages):
        if message.role != "user":
            continue
        declared_name = _extract_declared_name(message.content)
        if declared_name:
            return declared_name
    return None


def _extract_declared_name(value: str) -> str | None:
    for pattern in _NAME_DECLARATION_PATTERNS:
        match = pattern.search(value.strip())
        if match is None:
            continue
        candidate = _clean_memory_value(match.group(1))
        if candidate:
            return candidate
    return None


def _clean_memory_value(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value).strip(" \t\r\n\"'")
    normalized = re.sub(
        r"\s+(?:and|but|please|thanks|thank you|hãy|hay|nhe|nhé|và|va)\b.*$",
        "",
        normalized,
        flags=re.IGNORECASE,
    ).strip(" \t\r\n\"'")
    return normalized[:120]


def _is_name_recall_query(query: str) -> bool:
    normalized_query = re.sub(r"\s+", " ", query.lower()).strip(" ?!.")
    return any(trigger in normalized_query for trigger in _NAME_RECALL_TRIGGERS)


def _is_vietnamese_name_query(query: str) -> bool:
    normalized_query = re.sub(r"\s+", " ", query.lower())
    return any(token in normalized_query for token in ("tôi", "toi", "tên", "ten"))


def _build_contract_metadata_answer(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    query: str,
) -> ContractChatAnswer | None:
    normalized_query = _normalize_query_for_intent(query)
    if not _is_contract_metadata_query(normalized_query):
        return None

    draft = chat_session.draft or session.get(DocumentVersion, chat_session.draft_id)
    vietnamese_query = _is_vietnamese_metadata_query(query)
    title = contract.title
    document_type = contract.document_type or "General"
    description = contract.description
    draft_label = draft.version_label if draft is not None else None
    file_name = draft.file_name if draft is not None else None
    title_only = _is_contract_title_query(normalized_query) and not _is_contract_identity_query(normalized_query)

    if vietnamese_query:
        if title_only:
            lines = [f'Tên tài liệu là "{title}".']
        else:
            lines = [f'Đây là tài liệu "{title}".']
            lines.append(f"Loại tài liệu: {document_type}.")
            if description:
                lines.append(f"Mô tả: {description}.")
        if draft_label:
            draft_text = f"Bản nháp đang phân tích: {draft_label}"
            if file_name:
                draft_text = f"{draft_text} ({file_name})"
            lines.append(f"{draft_text}.")
        lines.append("Các câu hỏi về điều khoản sẽ được trả lời dựa trên nội dung hợp đồng đã phân tích.")
    else:
        if title_only:
            lines = [f'The document name is "{title}".']
        else:
            lines = [f'This document is "{title}".']
            lines.append(f"Document type: {document_type}.")
            if description:
                lines.append(f"Description: {description}.")
        if draft_label:
            draft_text = f"Active draft: {draft_label}"
            if file_name:
                draft_text = f"{draft_text} ({file_name})"
            lines.append(f"{draft_text}.")
        lines.append("Clause questions will be answered with references from the analyzed document.")

    return ContractChatAnswer(
        content="\n".join(lines),
        citations=[],
        provider_used="contract-metadata",
    )


def _is_contract_metadata_query(normalized_query: str) -> bool:
    if _is_contract_title_query(normalized_query) or _is_contract_identity_query(normalized_query):
        return True
    return False


def _is_contract_title_query(normalized_query: str) -> bool:
    has_document_reference = any(
        token in normalized_query
        for token in ("document", "contract", "tai lieu", "hop dong")
    )
    has_title_reference = any(
        token in normalized_query
        for token in ("name", "title", "ten")
    )
    return has_document_reference and has_title_reference


def _is_contract_identity_query(normalized_query: str) -> bool:
    identity_phrases = (
        "what document is this",
        "what contract is this",
        "what is this document",
        "what is this contract",
        "this document is what",
        "this contract is what",
        "tai lieu nay la tai lieu gi",
        "day la tai lieu gi",
        "tai lieu gi",
        "hop dong nay la hop dong gi",
        "day la hop dong gi",
        "hop dong gi",
        "loai tai lieu",
        "loai hop dong",
    )
    return any(phrase in normalized_query for phrase in identity_phrases)


def _is_vietnamese_metadata_query(query: str) -> bool:
    normalized_query = _normalize_query_for_intent(query)
    return any(token in normalized_query for token in ("tai lieu", "hop dong", "ten", "loai"))


def _normalize_query_for_intent(query: str) -> str:
    normalized = query.lower().replace("đ", "d")
    normalized = unicodedata.normalize("NFKD", normalized)
    normalized = "".join(character for character in normalized if not unicodedata.combining(character))
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _build_grounded_rag_answer(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    query: str,
    context_blocks: list[dict[str, object]],
    should_cancel: Callable[[], bool] | None = None,
) -> ContractChatAnswer:
    citations = _serialize_citations(context_blocks)
    _raise_if_cancelled(should_cancel)
    if settings.contract_chat_llm_enabled:
        llm_answer = _try_generate_llm_grounded_answer(
            session,
            contract=contract,
            chat_session=chat_session,
            query=query,
            context_blocks=context_blocks,
            should_cancel=should_cancel,
        )
        if llm_answer is not None:
            return ContractChatAnswer(
                content=llm_answer["content"],
                citations=citations,
                provider_used=llm_answer["provider_used"],
            )

    return ContractChatAnswer(
        content=_build_extractive_answer(context_blocks),
        citations=citations,
        provider_used="local-rag",
    )


def _try_generate_llm_grounded_answer(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    query: str,
    context_blocks: list[dict[str, object]],
    should_cancel: Callable[[], bool] | None = None,
) -> dict[str, str] | None:
    _raise_if_cancelled(should_cancel)
    payload = _build_contract_chat_llm_payload(
        session,
        contract=contract,
        chat_session=chat_session,
        query=query,
        context_blocks=context_blocks,
    )
    try:
        _raise_if_cancelled(should_cancel)
        generated = get_llm_adapter().generate_contract_chat_answer(
            payload,
            should_cancel=should_cancel,
        )
        _raise_if_cancelled(should_cancel)
    except ProviderRequestCancelled as exc:
        raise ChatGenerationCancelled() from exc
    except Exception:
        logger.exception("Contract chat LLM synthesis failed unexpectedly; falling back to local RAG.")
        return None

    if generated.error_message or not generated.content.strip():
        return None
    return {
        "content": generated.content.strip(),
        "provider_used": f"{generated.provider_used}:contract-chat",
    }


def _build_contract_chat_llm_payload(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    query: str,
    context_blocks: list[dict[str, object]],
) -> dict[str, object]:
    draft = chat_session.draft or session.get(DocumentVersion, chat_session.draft_id)
    return {
        "contract": {
            "title": contract.title,
            "document_type": contract.document_type,
            "description": contract.description,
            "draft_label": draft.version_label if draft is not None else None,
            "draft_file_name": draft.file_name if draft is not None else None,
        },
        "question": query,
        "recent_messages": _build_recent_conversation_messages(
            session,
            chat_session_id=chat_session.id,
            current_query=query,
        ),
        "evidence": [
            {
                "citation_number": index,
                "section_title": item.get("section_title"),
                "block_key": item.get("block_key"),
                "surface_type": item.get("surface_type"),
                "surface_key": item.get("surface_key"),
                "content": item.get("content"),
            }
            for index, item in enumerate(context_blocks, start=1)
        ],
        "instructions": {
            "truth_boundary": "Use only the supplied metadata, recent conversation, and evidence blocks.",
            "citation_style": "When relying on an evidence block, cite it inline as [citation_number].",
            "fallback": "If the evidence does not answer the question, say the contract draft does not contain enough information to answer.",
        },
    }


def _build_recent_conversation_messages(
    session: Session,
    *,
    chat_session_id: int,
    current_query: str,
) -> list[dict[str, str]]:
    messages = list_chat_messages(session, chat_session_id)
    if messages and messages[-1].role == "user" and messages[-1].content == current_query:
        messages = messages[:-1]
    return [
        {
            "role": message.role,
            "content": message.content,
        }
        for message in messages[-_CHAT_LLM_HISTORY_LIMIT:]
    ]


def _select_chat_context(
    query: str,
    retrieved_blocks: list[dict[str, object]],
    *,
    limit: int,
) -> list[dict[str, object]]:
    if not retrieved_blocks:
        return []

    expanded_query = _expand_query(query)
    substantive_blocks = [item for item in retrieved_blocks if not _is_heading_only_block(item)]
    candidate_blocks = substantive_blocks or retrieved_blocks

    scored_blocks = [
        (_score_chat_block(expanded_query, item), index, item)
        for index, item in enumerate(candidate_blocks)
    ]
    scored_blocks.sort(key=lambda item: (-item[0], item[1]))

    top_score = scored_blocks[0][0]
    minimum_score = max(_CHAT_CONTEXT_MIN_SCORE, top_score * 0.55)
    selected = [
        item
        for score, _index, item in scored_blocks
        if score >= minimum_score
    ]
    return selected[:limit]


def _expand_query(query: str) -> str:
    normalized_query = query.lower()
    expansions = [
        expansion
        for triggers, expansion in _QUERY_EXPANSIONS
        if any(trigger in normalized_query for trigger in triggers)
    ]
    return " ".join([query, *expansions])


def _score_chat_block(expanded_query: str, block: dict[str, object]) -> float:
    section_title = str(block.get("section_title") or "")
    content = str(block.get("content") or "")
    haystack = f"{section_title} {content}".lower()
    section_haystack = section_title.lower()
    query_tokens = set(_tokenize(expanded_query))

    lexical_score = 0.0
    for token in query_tokens:
        if token in haystack:
            lexical_score += 1.0
        if token in section_haystack:
            lexical_score += 0.5

    if content.strip():
        lexical_score += 0.25

    semantic_score = block.get("score")
    if isinstance(semantic_score, (float, int)):
        lexical_score += max(0.0, float(semantic_score)) * _SEMANTIC_SCORE_WEIGHT

    return lexical_score


def _tokenize(value: str) -> list[str]:
    return [
        token.lower()
        for token in _TOKEN_RE.findall(value)
        if token.lower() not in _STOP_WORDS
    ]


def _is_heading_only_block(block: dict[str, object]) -> bool:
    content = str(block.get("content") or "").strip()
    section_title = str(block.get("section_title") or "").strip()
    if not content:
        return True
    normalized_content = _normalize_heading_text(content)
    normalized_section = _normalize_heading_text(section_title)
    if normalized_section and normalized_content == normalized_section:
        return True
    return bool(re.fullmatch(r"\d+(\.\d+)*\.?\s+[A-Za-z][A-Za-z0-9 &/-]*", content))


def _normalize_heading_text(value: str) -> str:
    normalized = value.strip().lower()
    normalized = re.sub(r"^\d+(\.\d+)*\.?\s+", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _build_extractive_answer(context_blocks: list[dict[str, object]]) -> str:
    lines = [
        str(item.get("content") or "").strip()
        for item in context_blocks
        if str(item.get("content") or "").strip()
    ]
    if len(lines) == 1:
        return f"Here's what I found in the contract: {lines[0]}"
    return "Here's what I found in the contract:\n" + "\n".join(f"- {line}" for line in lines)


def _serialize_citations(retrieved_blocks: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            "block_id": item["block_id"],
            "block_key": item["block_key"],
            "section_title": item["section_title"],
            "surface_type": item["surface_type"],
            "surface_key": item["surface_key"],
            "content": item["content"],
        }
        for item in retrieved_blocks
    ]


def _serialize_compare_citations(
    change_items: list[ChangeItem],
    *,
    compare_run_id: int,
) -> list[dict[str, object]]:
    citations: list[dict[str, object]] = []
    for change_item in change_items:
        for label, block in (("source", change_item.source_block), ("target", change_item.target_block)):
            if block is None:
                continue
            citations.append(
                {
                    "block_id": block.id,
                    "block_key": block.block_key,
                    "section_title": block.section_title or change_item.section_title,
                    "surface_type": block.surface.surface_type if block.surface is not None else change_item.surface_type,
                    "surface_key": block.surface.surface_key if block.surface is not None else change_item.surface_key,
                    "content": block.normalized_content or block.raw_content,
                    "source_label": label,
                    "compare_run_id": compare_run_id,
                    "change_item_id": change_item.id,
                }
            )
    return citations


def _raise_if_cancelled(should_cancel: Callable[[], bool] | None) -> None:
    if should_cancel is not None and should_cancel():
        raise ChatGenerationCancelled()
