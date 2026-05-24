import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.core.config import settings
from app.models import User
from app.schemas.contract import (
    ChatAttemptCreate,
    ChatAttemptRead,
    ChatSessionCreate,
    ChatSessionRead,
    ClauseChangeRead,
    ContractChatAttemptCreateRead,
    ContractChatExchangeRead,
    ContractChatMessageRead,
    ContractChatMessageCreate,
    ContractCompareCreate,
    ContractCompareRunRead,
    ContractCreate,
    ContractDraftRead,
    ContractDraftUpdate,
    ContractRead,
    ContractUpdate,
)
from app.services import ai_rate_limit
from app.services import activity_logs as activity_log_service
from app.services import compare as compare_service
from app.services import contract_chat_attempts as contract_chat_attempt_service
from app.services import contract_chat_stream as contract_chat_stream_service
from app.services import contract_chat as contract_chat_service
from app.services import contracts as contract_service
from app.services import documents as document_service
from app.services.document_parser import DocumentParseError
from app.services import project_access as project_access_service


router = APIRouter(tags=["contracts"], dependencies=[Depends(get_current_user)])


def _ensure_contract_chat_streaming_enabled() -> None:
    if not settings.contract_chat_streaming_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Contract chat streaming is disabled",
        )


@router.get("/projects/{project_id}/contracts")
def list_contracts(
    project_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    contracts = document_service.list_documents(database, project_id)
    return {
        "data": [ContractRead.model_validate(contract_service.serialize_contract(contract)).model_dump(mode="json") for contract in contracts]
    }


@router.post("/projects/{project_id}/contracts", status_code=status.HTTP_201_CREATED)
def create_contract(
    project_id: int,
    payload: ContractCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_project_access_or_404(database, project_id, current_user.id)
    contract = contract_service.create_contract(
        database,
        project_id,
        title=payload.title,
        contract_type=payload.contract_type,
        description=payload.description,
    )
    activity_log_service.record(
        database,
        project_id=project_id,
        user_id=current_user.id,
        action="created",
        entity_type="contract",
        entity_id=contract.id,
        description=f'Created contract "{contract.title}"',
    )
    return {"data": ContractRead.model_validate(contract_service.serialize_contract(contract)).model_dump(mode="json")}


@router.get("/contracts/{contract_id}")
def get_contract(
    contract_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    return {"data": ContractRead.model_validate(contract_service.serialize_contract(contract)).model_dump(mode="json")}


@router.patch("/contracts/{contract_id}")
def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    contract = contract_service.update_contract(
        database,
        contract,
        title=payload.title,
        contract_type=payload.contract_type,
        description=payload.description,
    )
    return {"data": ContractRead.model_validate(contract_service.serialize_contract(contract)).model_dump(mode="json")}


@router.delete("/contracts/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(
    contract_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    project_id = contract.project_id
    contract_title = contract.title
    document_service.delete_document(database, contract)
    activity_log_service.record(
        database,
        project_id=project_id,
        user_id=current_user.id,
        action="deleted",
        entity_type="contract",
        entity_id=contract_id,
        description=f'Deleted contract "{contract_title}"',
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/contracts/{contract_id}/drafts")
def list_contract_drafts(
    contract_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    drafts = document_service.list_document_versions(database, contract_id)
    return {"data": [ContractDraftRead.model_validate(contract_service.serialize_contract_draft(draft)).model_dump(mode="json") for draft in drafts]}


@router.post("/contracts/{contract_id}/drafts", status_code=status.HTTP_201_CREATED)
def create_contract_draft(
    contract_id: int,
    draft_label: str = Form(...),
    notes: str | None = Form(default=None),
    file=File(...),
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    draft = document_service.create_document_version(
        database,
        document_id=contract_id,
        version_label=draft_label,
        notes=notes,
        actor_user_id=current_user.id,
        upload_file=file,
    )
    activity_log_service.record(
        database,
        project_id=contract.project_id,
        user_id=current_user.id,
        action="uploaded",
        entity_type="contract_draft",
        entity_id=draft.id,
        description=f'Uploaded draft "{draft_label}" to "{contract.title}"',
    )
    return {"data": ContractDraftRead.model_validate(contract_service.serialize_contract_draft(draft)).model_dump(mode="json")}


@router.get("/contract-drafts/{draft_id}")
def get_contract_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    draft = project_access_service.ensure_document_version_access_or_404(database, draft_id, current_user.id)
    return {"data": ContractDraftRead.model_validate(contract_service.serialize_contract_draft(draft)).model_dump(mode="json")}


@router.patch("/contract-drafts/{draft_id}")
def update_contract_draft(
    draft_id: int,
    payload: ContractDraftUpdate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    draft = project_access_service.ensure_document_version_access_or_404(database, draft_id, current_user.id)
    draft = document_service.update_document_version(
        database,
        draft,
        payload=contract_service.build_contract_draft_update(payload),
    )
    return {"data": ContractDraftRead.model_validate(contract_service.serialize_contract_draft(draft)).model_dump(mode="json")}


@router.delete("/contract-drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    draft = project_access_service.ensure_document_version_access_or_404(database, draft_id, current_user.id)
    contract = project_access_service.ensure_document_access_or_404(database, draft.document_id, current_user.id)
    draft_label = draft.version_label
    document_service.delete_document_version(database, draft)
    activity_log_service.record(
        database,
        project_id=contract.project_id,
        user_id=current_user.id,
        action="deleted",
        entity_type="contract_draft",
        entity_id=draft_id,
        description=f'Deleted draft "{draft_label}" from "{contract.title}"',
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/contract-drafts/{draft_id}/parse")
def parse_contract_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    draft = project_access_service.ensure_document_version_access_or_404(database, draft_id, current_user.id)
    contract = project_access_service.ensure_document_access_or_404(database, draft.document_id, current_user.id)
    try:
        draft = document_service.parse_document_version(database, draft)
    except DocumentParseError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    activity_log_service.record(
        database,
        project_id=contract.project_id,
        user_id=current_user.id,
        action="parsed",
        entity_type="contract_draft",
        entity_id=draft.id,
        description=f'Parsed draft "{draft.version_label}"',
    )
    return {"data": ContractDraftRead.model_validate(contract_service.serialize_contract_draft(draft)).model_dump(mode="json")}


@router.post("/contracts/{contract_id}/compare-runs", status_code=status.HTTP_201_CREATED)
def create_contract_compare_run(
    contract_id: int,
    payload: ContractCompareCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    compare_run = compare_service.create_compare_run(
        database,
        document_id=contract_id,
        source_version_id=payload.source_draft_id,
        target_version_id=payload.target_draft_id,
        actor_user_id=current_user.id,
    )
    activity_log_service.record(
        database,
        project_id=contract.project_id,
        user_id=current_user.id,
        action="compared",
        entity_type="compare_run",
        entity_id=compare_run["id"],
        description=f'Created compare run for contract "{contract.title}"',
    )
    return {"data": ContractCompareRunRead.model_validate(contract_service.serialize_contract_compare_run(compare_run)).model_dump(mode="json")}


@router.get("/contracts/{contract_id}/compare-runs")
def list_contract_compare_runs(
    contract_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    compare_runs = compare_service.list_document_compare_run_details(database, contract_id)
    return {
        "data": [
            ContractCompareRunRead.model_validate(contract_service.serialize_contract_compare_run(compare_run)).model_dump(mode="json")
            for compare_run in compare_runs
        ]
    }


@router.get("/contract-compare-runs/{compare_run_id}")
def get_contract_compare_run(
    compare_run_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_compare_run_access_or_404(database, compare_run_id, current_user.id)
    compare_run = compare_service.get_compare_run_detail(database, compare_run_id)
    return {"data": ContractCompareRunRead.model_validate(contract_service.serialize_contract_compare_run(compare_run)).model_dump(mode="json")}


@router.get("/contract-compare-runs/{compare_run_id}/clause-changes")
def list_clause_changes(
    compare_run_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_compare_run_access_or_404(database, compare_run_id, current_user.id)
    queue = compare_service.list_compare_run_change_items(database, compare_run_id)
    return {"data": [ClauseChangeRead.model_validate(contract_service.serialize_clause_change(item)).model_dump(mode="json") for item in queue]}


@router.post("/contracts/{contract_id}/chat/sessions", status_code=status.HTTP_201_CREATED)
def create_chat_session(
    contract_id: int,
    payload: ChatSessionCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    draft = project_access_service.ensure_document_version_access_or_404(database, payload.draft_id, current_user.id)
    contract_service.ensure_contract_draft_belongs_to_contract(contract, draft)
    compare_run = None
    if payload.compare_run_id is not None:
        compare_run = project_access_service.ensure_compare_run_access_or_404(
            database,
            payload.compare_run_id,
            current_user.id,
        )
    chat_session = contract_chat_service.create_chat_session(
        database,
        contract=contract,
        draft=draft,
        compare_run=compare_run,
        created_by_user_id=current_user.id,
        title=payload.title,
    )
    return {"data": ChatSessionRead.model_validate(contract_service.serialize_chat_session(chat_session)).model_dump(mode="json")}


@router.get("/contracts/{contract_id}/chat/sessions")
def list_chat_sessions(
    contract_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    sessions = contract_chat_service.list_chat_sessions(database, contract_id)
    return {"data": [ChatSessionRead.model_validate(contract_service.serialize_chat_session(chat_session)).model_dump(mode="json") for chat_session in sessions]}


@router.get("/contracts/{contract_id}/chat/sessions/{chat_session_id}/messages")
def list_chat_messages(
    contract_id: int,
    chat_session_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    chat_session = contract_chat_service.get_chat_session_or_404(database, chat_session_id)
    if chat_session.contract_id != contract.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    messages = contract_chat_service.list_chat_messages(database, chat_session_id)
    return {
        "data": [
            ContractChatMessageRead.model_validate(contract_service.serialize_chat_message(message)).model_dump(mode="json")
            for message in messages
        ]
    }


@router.post("/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts")
def create_contract_chat_attempt(
    contract_id: int,
    chat_session_id: int,
    payload: ChatAttemptCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    _ensure_contract_chat_streaming_enabled()
    ai_rate_limit.enforce_ai_chat_attempt_rate_limit(database, current_user.id)
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    chat_session = contract_chat_service.get_chat_session_or_404(database, chat_session_id)
    draft = project_access_service.ensure_document_version_access_or_404(database, payload.draft_id, current_user.id)
    contract_chat_service.ensure_chat_session_compare_run_is_current(database, chat_session)
    result, created = contract_chat_attempt_service.create_attempt(
        database,
        contract=contract,
        chat_session=chat_session,
        draft=draft,
        query=payload.query,
        client_request_id=payload.client_request_id,
        supersedes_attempt_id=payload.supersedes_attempt_id,
    )
    attempt = result["attempt"]
    user_message = result["user_message"]
    response_payload = ContractChatAttemptCreateRead.model_validate(
        {
            "session_id": chat_session.id,
            "user_message": contract_service.serialize_chat_message(user_message),
            "attempt": contract_chat_attempt_service.serialize_attempt(attempt),
            "stream_endpoint": f"/api/v1/contracts/{contract.id}/chat/sessions/{chat_session.id}/attempts/{attempt.id}/stream",
            "cancel_endpoint": f"/api/v1/contracts/{contract.id}/chat/sessions/{chat_session.id}/attempts/{attempt.id}/cancel",
        }
    ).model_dump(mode="json")
    return JSONResponse(
        {"data": response_payload},
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@router.get("/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts/{attempt_id}")
def get_contract_chat_attempt(
    contract_id: int,
    chat_session_id: int,
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    _ensure_contract_chat_streaming_enabled()
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    chat_session = contract_chat_service.get_chat_session_or_404(database, chat_session_id)
    attempt = contract_chat_attempt_service.get_attempt_or_404(database, attempt_id)
    if chat_session.contract_id != contract.id or attempt.session_id != chat_session.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat attempt not found")
    return {
        "data": ChatAttemptRead.model_validate(
            contract_chat_attempt_service.serialize_attempt(attempt)
        ).model_dump(mode="json")
    }


@router.post("/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts/{attempt_id}/cancel")
def cancel_contract_chat_attempt(
    contract_id: int,
    chat_session_id: int,
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    _ensure_contract_chat_streaming_enabled()
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    chat_session = contract_chat_service.get_chat_session_or_404(database, chat_session_id)
    attempt = contract_chat_attempt_service.cancel_attempt(
        database,
        contract=contract,
        chat_session=chat_session,
        attempt_id=attempt_id,
    )
    return {
        "data": ChatAttemptRead.model_validate(
            contract_chat_attempt_service.serialize_attempt(attempt)
        ).model_dump(mode="json")
    }


@router.post("/contracts/{contract_id}/chat/sessions/{chat_session_id}/attempts/{attempt_id}/stream")
def stream_contract_chat_attempt(
    contract_id: int,
    chat_session_id: int,
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    _ensure_contract_chat_streaming_enabled()
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    chat_session = contract_chat_service.get_chat_session_or_404(database, chat_session_id)
    attempt = contract_chat_attempt_service.get_attempt_or_404(database, attempt_id)
    if chat_session.contract_id != contract.id or attempt.session_id != chat_session.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat attempt not found")
    contract_chat_attempt_service.ensure_attempt_can_stream(attempt)
    return StreamingResponse(
        contract_chat_stream_service.stream_attempt(
            database,
            contract=contract,
            chat_session=chat_session,
            attempt=attempt,
        ),
        media_type="text/event-stream",
    )


@router.post("/contracts/{contract_id}/chat/sessions/{chat_session_id}/messages", status_code=status.HTTP_201_CREATED)
def create_contract_chat_message(
    contract_id: int,
    chat_session_id: int,
    payload: ContractChatMessageCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    ai_rate_limit.enforce_ai_chat_rate_limit(database, current_user.id)
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    chat_session = contract_chat_service.get_chat_session_or_404(database, chat_session_id)
    exchange = contract_chat_service.create_chat_exchange(
        database,
        contract=contract,
        chat_session=chat_session,
        query=payload.query,
    )
    return {
        "data": ContractChatExchangeRead.model_validate(
            {
                "session_id": exchange["session_id"],
                "user_message": contract_service.serialize_chat_message(exchange["user_message"]),
                "assistant_message": contract_service.serialize_chat_message(exchange["assistant_message"]),
            }
        ).model_dump(mode="json")
    }


@router.post("/contracts/{contract_id}/chat/sessions/{chat_session_id}/messages/stream")
def stream_contract_chat_message(
    contract_id: int,
    chat_session_id: int,
    payload: ContractChatMessageCreate,
    current_user: User = Depends(get_current_user),
    database: Session = Depends(get_db_session),
):
    _ensure_contract_chat_streaming_enabled()
    ai_rate_limit.enforce_ai_chat_rate_limit(database, current_user.id)
    contract = project_access_service.ensure_document_access_or_404(database, contract_id, current_user.id)
    chat_session = contract_chat_service.get_chat_session_or_404(database, chat_session_id)
    answer = contract_chat_service.generate_chat_answer(
        database,
        contract=contract,
        chat_session=chat_session,
        query=payload.query,
    )
    user_message, assistant_message = contract_chat_service.persist_chat_exchange(
        database,
        chat_session=chat_session,
        query=payload.query,
        answer=answer,
    )

    serialized_user_message = ContractChatMessageRead.model_validate(
        contract_service.serialize_chat_message(user_message)
    ).model_dump(mode="json")
    serialized_assistant_message = ContractChatMessageRead.model_validate(
        contract_service.serialize_chat_message(assistant_message)
    ).model_dump(mode="json")

    def event_stream():
        yield _sse_event(
            "metadata",
            {
                "session_id": chat_session.id,
                "user_message": serialized_user_message,
                "assistant_message_id": serialized_assistant_message["id"],
                "provider_used": serialized_assistant_message["provider_used"],
            },
        )
        for chunk in contract_chat_service.iter_sse_chunks(serialized_assistant_message["content"]):
            yield _sse_event("delta", {"content": chunk})
        yield _sse_event("citations", {"citations": serialized_assistant_message["citations"]})
        yield _sse_event("done", {"assistant_message": serialized_assistant_message})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse_event(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'), ensure_ascii=True)}\n\n"
