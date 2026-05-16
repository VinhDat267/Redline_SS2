from __future__ import annotations

import json
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AIRequirementCandidate, DocumentBlock, DocumentVersion, Requirement
from app.models.mixins import utcnow
from app.services.llm_adapter import LLMAdapter, NormalizedRequirementCandidate


CANDIDATE_STATUS_PENDING = "pending"
CANDIDATE_STATUS_ACCEPTED = "accepted"
CANDIDATE_STATUS_REJECTED = "rejected"


def get_llm_adapter() -> LLMAdapter:
    return LLMAdapter()


def list_requirement_candidates(
    session: Session,
    version: DocumentVersion,
) -> dict[str, object]:
    candidates = _load_candidates_for_active_parse_run(session, version)
    return {
        "summary": _build_summary(candidates),
        "candidates": candidates,
    }


def generate_requirement_candidates(
    session: Session,
    version: DocumentVersion,
    *,
    force_regenerate: bool = False,
    adapter: LLMAdapter | None = None,
) -> dict[str, object]:
    _ensure_version_is_parsed(version)
    active_parse_run_id = int(version.active_parse_run_id)

    existing_candidates = _load_candidates_for_active_parse_run(session, version)
    if existing_candidates and not force_regenerate:
        provider_used = next((candidate.provider_used for candidate in existing_candidates if candidate.provider_used), None)
        return {
            "summary": _build_summary(existing_candidates),
            "candidates": existing_candidates,
            "provider_used": provider_used,
            "fallback_used": any(candidate.fallback_used for candidate in existing_candidates),
            "error_message": None,
        }

    if force_regenerate:
        for candidate in existing_candidates:
            if candidate.status == CANDIDATE_STATUS_PENDING:
                session.delete(candidate)
        session.flush()

    blocks = _load_parse_blocks(session, active_parse_run_id)
    if not blocks:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Parsed version has no blocks available for requirement extraction",
        )

    extraction_adapter = adapter or get_llm_adapter()
    extraction_result = extraction_adapter.generate_requirement_candidates(
        _build_extraction_payload(version, active_parse_run_id, blocks)
    )

    block_by_key = {block.block_key: block for block in blocks}
    created_or_updated = _upsert_candidates(
        session,
        version,
        active_parse_run_id,
        extraction_result.candidates,
        block_by_key,
        provider_used=extraction_result.provider_used,
        fallback_used=extraction_result.fallback_used,
        error_message=extraction_result.error_message,
    )
    session.commit()
    for candidate in created_or_updated:
        session.refresh(candidate)

    candidates = _load_candidates_for_active_parse_run(session, version)
    return {
        "summary": _build_summary(candidates),
        "candidates": candidates,
        "provider_used": extraction_result.provider_used,
        "fallback_used": extraction_result.fallback_used,
        "error_message": extraction_result.error_message,
    }


def get_requirement_candidate_or_404(session: Session, candidate_id: int) -> AIRequirementCandidate:
    candidate = session.get(AIRequirementCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requirement candidate not found",
        )
    return candidate


def accept_requirement_candidate(
    session: Session,
    candidate: AIRequirementCandidate,
) -> AIRequirementCandidate:
    if candidate.status == CANDIDATE_STATUS_ACCEPTED and candidate.accepted_requirement_id is not None:
        return candidate

    version = candidate.document_version
    existing_requirement = session.scalar(
        select(Requirement).where(
            Requirement.document_id == version.document_id,
            Requirement.requirement_code == candidate.requirement_code,
        )
    )

    if existing_requirement is None:
        existing_requirement = Requirement(
            document_id=version.document_id,
            requirement_code=candidate.requirement_code,
            title=candidate.title,
            description=candidate.description,
            source_section=candidate.source_section,
            source_block_key=candidate.source_block_key,
            status="active",
        )
        session.add(existing_requirement)
        session.flush()

    candidate.status = CANDIDATE_STATUS_ACCEPTED
    candidate.accepted_requirement_id = existing_requirement.id
    candidate.decided_at = utcnow()
    candidate.rejection_reason = None
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


def reject_requirement_candidate(
    session: Session,
    candidate: AIRequirementCandidate,
    *,
    reason: str | None = None,
) -> AIRequirementCandidate:
    if candidate.status == CANDIDATE_STATUS_ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Accepted requirement candidates cannot be rejected",
        )

    candidate.status = CANDIDATE_STATUS_REJECTED
    candidate.decided_at = utcnow()
    candidate.rejection_reason = reason.strip() if reason and reason.strip() else None
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


def _ensure_version_is_parsed(version: DocumentVersion) -> None:
    if version.active_parse_run_id is None or version.parse_status not in {"parsed", "parsed_with_warnings"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document version must be parsed before extracting requirements",
        )


def _load_candidates_for_active_parse_run(
    session: Session,
    version: DocumentVersion,
) -> list[AIRequirementCandidate]:
    if version.active_parse_run_id is None:
        return []
    return list(
        session.scalars(
            select(AIRequirementCandidate)
            .where(AIRequirementCandidate.document_version_id == version.id)
            .where(AIRequirementCandidate.parse_run_id == version.active_parse_run_id)
            .order_by(AIRequirementCandidate.id)
        )
    )


def _load_parse_blocks(session: Session, parse_run_id: int) -> list[DocumentBlock]:
    return list(
        session.scalars(
            select(DocumentBlock)
            .where(DocumentBlock.parse_run_id == parse_run_id)
            .order_by(DocumentBlock.order_index)
        )
    )


def _build_extraction_payload(
    version: DocumentVersion,
    parse_run_id: int,
    blocks: Iterable[DocumentBlock],
) -> dict[str, object]:
    return {
        "document_version_id": version.id,
        "document_id": version.document_id,
        "parse_run_id": parse_run_id,
        "guidance": (
            "Identify requirement candidates from parsed DOCX blocks. Prefer explicit requirement IDs, "
            "shall/must/should statements, and SRS requirement tables."
        ),
        "blocks": [
            {
                "block_id": block.id,
                "block_key": block.block_key,
                "block_type": block.block_type,
                "section_title": block.section_title,
                "content": block.normalized_content,
            }
            for block in blocks
        ],
    }


def _upsert_candidates(
    session: Session,
    version: DocumentVersion,
    parse_run_id: int,
    normalized_candidates: list[NormalizedRequirementCandidate],
    block_by_key: dict[str, DocumentBlock],
    *,
    provider_used: str,
    fallback_used: bool,
    error_message: str | None,
) -> list[AIRequirementCandidate]:
    persisted: list[AIRequirementCandidate] = []
    seen_keys: set[tuple[str, str]] = set()

    for index, normalized_candidate in enumerate(normalized_candidates, start=1):
        requirement_code = _normalize_requirement_code(normalized_candidate.requirement_code, index)
        source_block_key = _normalize_source_block_key(normalized_candidate.source_block_key, index)
        dedupe_key = (requirement_code, source_block_key)
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)

        existing_candidate = session.scalar(
            select(AIRequirementCandidate).where(
                AIRequirementCandidate.document_version_id == version.id,
                AIRequirementCandidate.parse_run_id == parse_run_id,
                AIRequirementCandidate.requirement_code == requirement_code,
                AIRequirementCandidate.source_block_key == source_block_key,
            )
        )
        block = block_by_key.get(source_block_key)
        if existing_candidate is None:
            existing_candidate = AIRequirementCandidate(
                document_version_id=version.id,
                parse_run_id=parse_run_id,
                requirement_code=requirement_code,
                source_block_key=source_block_key,
                status=CANDIDATE_STATUS_PENDING,
            )

        if existing_candidate.status == CANDIDATE_STATUS_PENDING:
            existing_candidate.title = normalized_candidate.title[:255]
            existing_candidate.description = normalized_candidate.description
            existing_candidate.source_section = normalized_candidate.source_section
            existing_candidate.document_block_id = block.id if block is not None else None
            existing_candidate.confidence = normalized_candidate.confidence
            existing_candidate.provider_used = provider_used
            existing_candidate.fallback_used = fallback_used
            existing_candidate.error_message = error_message
            existing_candidate.raw_ai_payload = json.dumps(
                {
                    "requirement_code": normalized_candidate.requirement_code,
                    "title": normalized_candidate.title,
                    "description": normalized_candidate.description,
                    "source_section": normalized_candidate.source_section,
                    "source_block_key": normalized_candidate.source_block_key,
                    "confidence": normalized_candidate.confidence,
                },
                ensure_ascii=True,
                sort_keys=True,
            )
            session.add(existing_candidate)
        persisted.append(existing_candidate)

    return persisted


def _normalize_requirement_code(requirement_code: str | None, index: int) -> str:
    normalized = requirement_code.strip() if requirement_code else ""
    if not normalized:
        normalized = f"REQ-AI-{index:03d}"
    return normalized[:100]


def _normalize_source_block_key(source_block_key: str | None, index: int) -> str:
    normalized = source_block_key.strip() if source_block_key else ""
    if not normalized:
        normalized = f"ai-source-{index:03d}"
    return normalized[:255]


def _build_summary(candidates: list[AIRequirementCandidate]) -> dict[str, int]:
    summary = {
        "total": len(candidates),
        CANDIDATE_STATUS_PENDING: 0,
        CANDIDATE_STATUS_ACCEPTED: 0,
        CANDIDATE_STATUS_REJECTED: 0,
    }
    for candidate in candidates:
        if candidate.status in summary:
            summary[candidate.status] += 1
    return summary
