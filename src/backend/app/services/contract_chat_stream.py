from __future__ import annotations

import json
import logging
from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.models import ChatAttempt, ChatSession, Document
from app.services import contract_chat, contract_chat_attempts
from app.services import contracts as contract_service


logger = logging.getLogger(__name__)


def encode_event(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'), ensure_ascii=True, default=str)}\n\n"


class SequenceCounter:
    def __init__(self) -> None:
        self.value = 0

    def next_payload(self, attempt: ChatAttempt, payload: dict[str, object] | None = None) -> dict[str, object]:
        self.value += 1
        return {
            "attempt_id": attempt.id,
            "session_id": attempt.session_id,
            "sequence": self.value,
            **(payload or {}),
        }


def _is_cancelled(attempt: ChatAttempt) -> bool:
    return attempt.cancel_requested_at is not None or attempt.status in {"cancelling", "cancelled"}


def _rollback_failed_stream_session(session: Session) -> None:
    try:
        session.rollback()
    except Exception:
        logger.exception("Failed to rollback failed contract chat stream transaction.")


def _mark_error_and_encode(
    session: Session,
    *,
    attempt: ChatAttempt,
    counter: SequenceCounter,
    error_code: str,
    error_detail: str,
) -> str:
    _rollback_failed_stream_session(session)

    contract_chat_attempts.mark_attempt_error(
        session,
        attempt,
        error_code=error_code,
        error_detail=error_detail,
    )
    return encode_event(
        "error",
        counter.next_payload(
            attempt,
            {
                "status": "error",
                "error_code": error_code,
                "error_detail": error_detail,
            },
        ),
    )


def stream_attempt(
    session: Session,
    *,
    contract: Document,
    chat_session: ChatSession,
    attempt: ChatAttempt,
) -> Iterator[str]:
    counter = SequenceCounter()

    def should_cancel() -> bool:
        session.refresh(attempt)
        return _is_cancelled(attempt)

    yield encode_event(
        "metadata",
        counter.next_payload(
            attempt,
            {
                "user_message_id": attempt.user_message_id,
                "provider_used": attempt.provider_used,
            },
        ),
    )

    if _is_cancelled(attempt):
        contract_chat_attempts.mark_attempt_cancelled(session, attempt)
        yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
        return

    try:
        contract_chat_attempts.mark_attempt_status(session, attempt, "grounding")
        yield encode_event("status", counter.next_payload(attempt, {"status": "grounding"}))

        session.refresh(attempt)
        if _is_cancelled(attempt):
            contract_chat_attempts.mark_attempt_cancelled(session, attempt)
            yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
            return

        answer = contract_chat.generate_chat_answer(
            session,
            contract=contract,
            chat_session=chat_session,
            query=attempt.user_message.content,
            should_cancel=should_cancel,
        )

        session.refresh(attempt)
        if _is_cancelled(attempt):
            contract_chat_attempts.mark_attempt_cancelled(session, attempt)
            yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
            return

        contract_chat_attempts.mark_attempt_status(session, attempt, "answering")
        yield encode_event("status", counter.next_payload(attempt, {"status": "answering"}))

        for chunk in contract_chat.iter_sse_chunks(answer.content):
            session.refresh(attempt)
            if _is_cancelled(attempt):
                contract_chat_attempts.mark_attempt_cancelled(session, attempt)
                yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
                return
            yield encode_event("delta", counter.next_payload(attempt, {"content": chunk}))

        session.refresh(attempt)
        if _is_cancelled(attempt):
            contract_chat_attempts.mark_attempt_cancelled(session, attempt)
            yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
            return

        contract_chat_attempts.mark_attempt_status(session, attempt, "sources_pending")
        yield encode_event("sources_pending", counter.next_payload(attempt, {"status": "sources_pending"}))
        yield encode_event("citations", counter.next_payload(attempt, {"citations": answer.citations}))

        session.refresh(attempt)
        if _is_cancelled(attempt):
            contract_chat_attempts.mark_attempt_cancelled(session, attempt)
            yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
            return

        assistant_message = contract_chat.persist_assistant_message(
            session,
            chat_session=chat_session,
            answer=answer,
        )
        contract_chat_attempts.mark_attempt_done(session, attempt, provider_used=answer.provider_used)
        yield encode_event(
            "done",
            counter.next_payload(
                attempt,
                {
                    "status": "done",
                    "assistant_message": contract_service.serialize_chat_message(assistant_message),
                },
            ),
        )
    except contract_chat.ChatGenerationCancelled:
        contract_chat_attempts.mark_attempt_cancelled(session, attempt)
        yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
        return
    except Exception:
        logger.exception("Contract chat attempt stream failed.")
        _rollback_failed_stream_session(session)
        try:
            session.refresh(attempt)
        except Exception:
            logger.exception("Failed to refresh contract chat attempt after stream error.")
        if _is_cancelled(attempt):
            contract_chat_attempts.mark_attempt_cancelled(session, attempt)
            yield encode_event("cancelled", counter.next_payload(attempt, {"status": "cancelled"}))
            return
        yield _mark_error_and_encode(
            session,
            attempt=attempt,
            counter=counter,
            error_code="generation_failed",
            error_detail="Contract chat generation failed.",
        )
