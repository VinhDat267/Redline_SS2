from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models import ChatAttempt, ChatMessage, ChatSession, Document, DocumentVersion
from app.models.chat_attempt import ACTIVE_CHAT_ATTEMPT_STATUSES
from app.models.mixins import utcnow
from app.services import contracts as contract_service


ACTIVE_ATTEMPT_STATUSES = set(ACTIVE_CHAT_ATTEMPT_STATUSES)
TERMINAL_ATTEMPT_STATUSES = {"done", "cancelled", "error"}


def create_attempt(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    draft: DocumentVersion,
    query: str,
    client_request_id: str,
    supersedes_attempt_id: int | None = None,
) -> tuple[dict[str, ChatAttempt | ChatMessage], bool]:
    _ensure_attempt_scope(contract=contract, chat_session=chat_session, draft=draft)

    existing_attempt = session.scalar(
        select(ChatAttempt)
        .where(
            ChatAttempt.session_id == chat_session.id,
            ChatAttempt.client_request_id == client_request_id,
        )
        .options(joinedload(ChatAttempt.user_message))
    )
    if existing_attempt is not None:
        return {"attempt": existing_attempt, "user_message": existing_attempt.user_message}, False

    active_attempt = session.scalar(
        select(ChatAttempt).where(
            ChatAttempt.session_id == chat_session.id,
            ChatAttempt.status.in_(ACTIVE_ATTEMPT_STATUSES),
        )
    )
    if active_attempt is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chat session already has an active attempt",
        )

    if supersedes_attempt_id is not None:
        superseded = session.get(ChatAttempt, supersedes_attempt_id)
        if superseded is None or superseded.session_id != chat_session.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superseded attempt not found")

    user_message = ChatMessage(
        session_id=chat_session.id,
        role="user",
        content=query,
        citations_json=None,
        provider_used=None,
    )
    session.add(user_message)
    session.flush()

    attempt = ChatAttempt(
        session_id=chat_session.id,
        draft_id=draft.id,
        user_message_id=user_message.id,
        supersedes_attempt_id=supersedes_attempt_id,
        status="starting",
        client_request_id=client_request_id,
    )
    session.add(attempt)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        concurrent_existing_attempt = session.scalar(
            select(ChatAttempt)
            .where(
                ChatAttempt.session_id == chat_session.id,
                ChatAttempt.client_request_id == client_request_id,
            )
            .options(joinedload(ChatAttempt.user_message))
        )
        if concurrent_existing_attempt is not None:
            return {
                "attempt": concurrent_existing_attempt,
                "user_message": concurrent_existing_attempt.user_message,
            }, False

        concurrent_active_attempt = session.scalar(
            select(ChatAttempt).where(
                ChatAttempt.session_id == chat_session.id,
                ChatAttempt.status.in_(ACTIVE_ATTEMPT_STATUSES),
            )
        )
        if concurrent_active_attempt is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Chat session already has an active attempt",
            )
        raise

    session.refresh(user_message)
    session.refresh(attempt)
    return {"attempt": attempt, "user_message": user_message}, True


def get_attempt_or_404(session: Session, attempt_id: int) -> ChatAttempt:
    attempt = session.scalar(
        select(ChatAttempt)
        .where(ChatAttempt.id == attempt_id)
        .options(joinedload(ChatAttempt.user_message))
    )
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat attempt not found")
    return attempt


def ensure_attempt_can_stream(attempt: ChatAttempt) -> None:
    if attempt.status in {"done", "error"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chat attempt is already complete",
        )


def cancel_attempt(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    attempt_id: int,
) -> ChatAttempt:
    attempt = get_attempt_or_404(session, attempt_id)
    _ensure_attempt_belongs_to_scope(contract=contract, chat_session=chat_session, attempt=attempt)

    if attempt.status in TERMINAL_ATTEMPT_STATUSES:
        return attempt

    attempt.status = "cancelled"
    attempt.cancel_requested_at = utcnow()
    session.commit()
    session.refresh(attempt)
    return attempt


def mark_attempt_status(session: Session, attempt: ChatAttempt, status_value: str) -> ChatAttempt:
    attempt.status = status_value
    session.commit()
    session.refresh(attempt)
    return attempt


def mark_attempt_done(session: Session, attempt: ChatAttempt, *, provider_used: str) -> ChatAttempt:
    attempt.status = "done"
    attempt.provider_used = provider_used
    attempt.error_code = None
    attempt.error_detail = None
    session.commit()
    session.refresh(attempt)
    return attempt


def mark_attempt_cancelled(session: Session, attempt: ChatAttempt) -> ChatAttempt:
    attempt.status = "cancelled"
    session.commit()
    session.refresh(attempt)
    return attempt


def mark_attempt_error(
    session: Session,
    attempt: ChatAttempt,
    *,
    error_code: str,
    error_detail: str | None = None,
) -> ChatAttempt:
    attempt.status = "error"
    attempt.error_code = error_code
    attempt.error_detail = (error_detail or "")[:2000] or None
    session.commit()
    session.refresh(attempt)
    return attempt


def serialize_attempt(attempt: ChatAttempt) -> dict[str, object]:
    return {
        "id": attempt.id,
        "session_id": attempt.session_id,
        "draft_id": attempt.draft_id,
        "user_message_id": attempt.user_message_id,
        "supersedes_attempt_id": attempt.supersedes_attempt_id,
        "status": attempt.status,
        "provider_used": attempt.provider_used,
        "client_request_id": attempt.client_request_id,
        "error_code": attempt.error_code,
        "error_detail": attempt.error_detail,
        "created_at": attempt.created_at,
        "updated_at": attempt.updated_at,
    }


def _ensure_attempt_scope(
    *,
    contract: Document,
    chat_session: ChatSession,
    draft: DocumentVersion,
) -> None:
    if chat_session.contract_id != contract.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    contract_service.ensure_contract_draft_belongs_to_contract(contract, draft)
    if chat_session.draft_id != draft.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Attempt draft must match chat session draft")


def _ensure_attempt_belongs_to_scope(
    *,
    contract: Document,
    chat_session: ChatSession,
    attempt: ChatAttempt,
) -> None:
    if chat_session.contract_id != contract.id or attempt.session_id != chat_session.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat attempt not found")
