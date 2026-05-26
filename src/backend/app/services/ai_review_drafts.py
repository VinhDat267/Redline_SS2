from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    AIReviewDraft,
    ChangeItem,
    ChangeItemRequirementLink,
    CompareRun,
    DocumentBlock,
    DocumentVersion,
    ProjectMember,
    Requirement,
    RequirementTestCaseMapping,
    ReviewComment,
)
from app.models.mixins import utcnow
from app.services import change_items as change_item_service
from app.services import compare as compare_service
from app.services.llm_adapter import LLMAdapter, NormalizedAIReviewDraft


def get_llm_adapter() -> LLMAdapter:
    return LLMAdapter()


def generate_compare_run_ai_drafts(
    session: Session,
    compare_run_id: int,
    actor_user_id: int | None,
    force_regenerate: bool,
    use_rag: bool = True,
    change_item_ids: list[int] | None = None,
) -> dict[str, object]:
    compare_run = _get_compare_run_or_404(session, compare_run_id)
    compare_service.ensure_compare_run_is_current(session, compare_run)
    change_items = _load_compare_run_change_items(session, compare_run_id, change_item_ids)
    adapter = get_llm_adapter()

    draft_results = generate_change_item_ai_draft_records_batch(
        session,
        change_item_ids=[change_item.id for change_item in change_items],
        actor_user_id=actor_user_id,
        force_regenerate=force_regenerate,
        use_rag=use_rag,
        adapter=adapter,
    )
    results = [
        _serialize_generation_result(change_item_id, draft)
        for change_item_id, draft, _skipped in draft_results
    ]

    session.commit()
    generated_count = sum(1 for item in results if item["generation_status"] == "generated")
    failed_count = sum(1 for item in results if item["generation_status"] == "failed")
    return {
        "compare_run_id": compare_run_id,
        "requested_count": len(change_items),
        "generated_count": generated_count,
        "failed_count": failed_count,
        "results": results,
    }


def generate_change_item_ai_draft(
    session: Session,
    change_item_id: int,
    actor_user_id: int | None,
    force_regenerate: bool,
    use_rag: bool = True,
) -> dict[str, object]:
    draft, _ = generate_change_item_ai_draft_record(
        session,
        change_item_id=change_item_id,
        actor_user_id=actor_user_id,
        force_regenerate=force_regenerate,
        use_rag=use_rag,
        adapter=get_llm_adapter(),
    )
    session.commit()
    detail = change_item_service.get_change_item_detail(session, change_item_id)
    return {
        "change_item_id": change_item_id,
        "ai_review_draft": detail["ai_review_draft"] if detail["ai_review_draft"] is not None else draft,
    }


def generate_change_item_ai_draft_record(
    session: Session,
    *,
    change_item_id: int,
    actor_user_id: int | None,
    force_regenerate: bool,
    use_rag: bool = True,
    adapter: LLMAdapter | None = None,
) -> tuple[AIReviewDraft, bool]:
    change_item = _get_change_item_or_404(session, change_item_id)
    compare_service.ensure_compare_run_is_current(session, change_item.compare_run)
    return _generate_change_item_ai_review_draft_result(
        change_item,
        session=session,
        adapter=adapter or get_llm_adapter(),
        force_regenerate=force_regenerate,
        use_rag=use_rag,
        actor_user_id=actor_user_id,
    )


def generate_change_item_ai_draft_records_batch(
    session: Session,
    *,
    change_item_ids: list[int],
    actor_user_id: int | None,
    force_regenerate: bool,
    use_rag: bool = True,
    adapter: LLMAdapter | None = None,
) -> list[tuple[int, AIReviewDraft, bool]]:
    if not change_item_ids:
        return []

    ordered_change_item_ids = list(dict.fromkeys(change_item_ids))
    change_items = _load_change_items_by_ids(session, ordered_change_item_ids)
    for change_item in change_items:
        compare_service.ensure_compare_run_is_current(session, change_item.compare_run)
    review_adapter = adapter or get_llm_adapter()

    results_by_change_item_id: dict[int, tuple[AIReviewDraft, bool]] = {}
    pending_change_items: list[ChangeItem] = []
    pending_payloads: list[dict[str, object]] = []

    for change_item in change_items:
        existing_draft = change_item.ai_review_draft
        if existing_draft is not None and existing_draft.generation_status == "generated" and not force_regenerate:
            results_by_change_item_id[change_item.id] = (existing_draft, True)
            continue
        pending_change_items.append(change_item)

    # Pre-compute RAG query embeddings for all pending items in one batch
    precomputed_embeddings: dict[int, tuple[str, list[float]]] = {}
    if use_rag and pending_change_items:
        from app.services import rag_service
        queries = []
        for ci in pending_change_items:
            query = " ".join(
                p.strip() for p in (ci.section_title or "", ci.old_content or "", ci.new_content or "")
                if p and p.strip()
            )
            queries.append(query or "")
        embedding_payloads = rag_service.build_text_embedding_payloads(queries)
        for ci, (provider, vector, _) in zip(pending_change_items, embedding_payloads):
            precomputed_embeddings[ci.id] = (provider, vector)

    for change_item in pending_change_items:
        pending_payloads.append(
            _build_generation_payload(
                session,
                change_item,
                actor_user_id=actor_user_id,
                use_rag=use_rag,
                precomputed_embedding=precomputed_embeddings.get(change_item.id),
            )
        )

    if pending_payloads:
        batch_generate = getattr(review_adapter, "generate_ai_review_drafts_batch", None)
        if callable(batch_generate):
            normalized_drafts = batch_generate(pending_payloads)
        else:
            normalized_drafts = [
                review_adapter.generate_ai_review_draft(payload)
                for payload in pending_payloads
            ]

        for change_item, normalized_draft in zip(
            pending_change_items,
            normalized_drafts,
            strict=True,
        ):
            if normalized_draft.generation_status == "generated":
                normalized_draft.risk_level = calibrate_generated_risk_level(
                    change_item,
                    normalized_draft.risk_level,
                )

            existing_draft = change_item.ai_review_draft
            draft = existing_draft or AIReviewDraft(
                change_item_id=change_item.id,
                explanation=normalized_draft.explanation,
                generation_status=normalized_draft.generation_status,
            )
            if normalized_draft.generation_status == "generated":
                _apply_generated_draft(draft, normalized_draft)
            else:
                _apply_failed_draft(
                    draft,
                    normalized_draft,
                    preserve_existing=existing_draft is not None,
                )

            session.add(draft)
            change_item.ai_review_draft = draft
            results_by_change_item_id[change_item.id] = (draft, False)

    return [
        (change_item_id, results_by_change_item_id[change_item_id][0], results_by_change_item_id[change_item_id][1])
        for change_item_id in ordered_change_item_ids
    ]


def _load_compare_run_change_items(
    session: Session,
    compare_run_id: int,
    change_item_ids: list[int] | None,
) -> list[ChangeItem]:
    statement = _change_item_query().where(ChangeItem.compare_run_id == compare_run_id).order_by(ChangeItem.id)
    if change_item_ids:
        unique_ids = sorted(set(change_item_ids))
        statement = statement.where(ChangeItem.id.in_(unique_ids))
    change_items = list(session.execute(statement).unique().scalars())
    if not change_items and change_item_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change items not found for compare run")
    if change_item_ids and len(change_items) != len(set(change_item_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change items not found for compare run")
    return change_items


def _load_change_items_by_ids(session: Session, change_item_ids: list[int]) -> list[ChangeItem]:
    change_items = list(
        session.execute(
            _change_item_query()
            .where(ChangeItem.id.in_(change_item_ids))
        )
        .unique()
        .scalars()
    )
    change_items_by_id = {change_item.id: change_item for change_item in change_items}
    if len(change_items_by_id) != len(change_item_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change items not found")
    return [change_items_by_id[change_item_id] for change_item_id in change_item_ids]


def _get_compare_run_or_404(session: Session, compare_run_id: int) -> CompareRun:
    compare_run = session.get(CompareRun, compare_run_id)
    if compare_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compare run not found")
    return compare_run


def _get_change_item_or_404(session: Session, change_item_id: int) -> ChangeItem:
    change_item = session.execute(
        _change_item_query().where(ChangeItem.id == change_item_id)
    ).unique().scalar_one_or_none()
    if change_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change item not found")
    return change_item


def _change_item_query():
    return (
        select(ChangeItem)
        .options(
            joinedload(ChangeItem.ai_review_draft),
            joinedload(ChangeItem.review_comments).joinedload(ReviewComment.author),
            joinedload(ChangeItem.requirement_links)
            .joinedload(ChangeItemRequirementLink.requirement)
            .joinedload(Requirement.test_case_mappings)
            .joinedload(RequirementTestCaseMapping.test_case),
            joinedload(ChangeItem.source_block).joinedload(DocumentBlock.surface),
            joinedload(ChangeItem.source_version)
            .joinedload(DocumentVersion.document),
            joinedload(ChangeItem.target_block).joinedload(DocumentBlock.surface),
            joinedload(ChangeItem.target_version),
        )
    )


def _generate_change_item_ai_review_draft(
    session: Session,
    change_item: ChangeItem,
    *,
    adapter: LLMAdapter,
    force_regenerate: bool,
    use_rag: bool = True,
    actor_user_id: int | None,
) -> AIReviewDraft:
    return _generate_change_item_ai_review_draft_result(
        change_item,
        session=session,
        adapter=adapter,
        force_regenerate=force_regenerate,
        use_rag=use_rag,
        actor_user_id=actor_user_id,
    )[0]


def _generate_change_item_ai_review_draft_result(
    change_item: ChangeItem,
    *,
    session: Session,
    adapter: LLMAdapter,
    force_regenerate: bool,
    use_rag: bool,
    actor_user_id: int | None,
) -> tuple[AIReviewDraft, bool]:
    existing_draft = change_item.ai_review_draft
    if existing_draft is not None and existing_draft.generation_status == "generated" and not force_regenerate:
        return existing_draft, True

    payload = _build_generation_payload(session, change_item, actor_user_id=actor_user_id, use_rag=use_rag)
    normalized_draft = adapter.generate_ai_review_draft(payload)
    if normalized_draft.generation_status == "generated":
        normalized_draft.risk_level = calibrate_generated_risk_level(
            change_item,
            normalized_draft.risk_level,
        )
    draft = existing_draft or AIReviewDraft(
        change_item_id=change_item.id,
        explanation=normalized_draft.explanation,
        generation_status=normalized_draft.generation_status,
    )

    if normalized_draft.generation_status == "generated":
        _apply_generated_draft(draft, normalized_draft)
    else:
        _apply_failed_draft(draft, normalized_draft, preserve_existing=existing_draft is not None)

    session.add(draft)
    change_item.ai_review_draft = draft
    return draft, False


def _build_generation_payload(
    session: Session,
    change_item: ChangeItem,
    *,
    actor_user_id: int | None,
    use_rag: bool,
    precomputed_embedding: tuple[str, list[float]] | None = None,
) -> dict[str, object]:
    project_id = change_item.source_version.document.project_id
    project_members = list(
        session.scalars(
            select(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .options(joinedload(ProjectMember.user))
            .order_by(ProjectMember.id)
        )
    )

    impacted_tests_by_id: dict[int, dict[str, object]] = {}
    linked_requirements: list[dict[str, object]] = []

    for requirement_link in change_item.requirement_links:
        requirement = requirement_link.requirement
        linked_requirements.append(
            {
                "requirement_id": requirement.id,
                "requirement_code": requirement.requirement_code,
                "title": requirement.title,
                "link_type": requirement_link.link_type,
                "notes": requirement_link.notes,
            }
        )
        for mapping in requirement.test_case_mappings:
            test_case = mapping.test_case
            impacted_tests_by_id[test_case.id] = {
                "test_case_id": test_case.id,
                "test_case_code": test_case.test_case_code,
                "title": test_case.title,
                "priority": test_case.priority,
                "status": test_case.status,
            }

    return {
        "actor_user_id": actor_user_id,
        "change_item_id": change_item.id,
        "compare_run_id": change_item.compare_run_id,
        "valid_assignee_ids": [member.user_id for member in project_members],
        "change_item": {
            "change_type": change_item.change_type,
            "section_title": change_item.section_title,
            "surface_type": change_item.surface_type,
            "surface_key": change_item.surface_key,
            "container_type": change_item.container_type,
            "container_key": change_item.container_key,
            "table_key": change_item.table_key,
            "row_key": change_item.row_key,
            "old_content": change_item.old_content,
            "new_content": change_item.new_content,
            "change_context_json": change_item.change_context_json,
            "structured_diff_json": change_item.structured_diff_json,
        },
        "linked_requirements": linked_requirements,
        "impacted_tests": sorted(impacted_tests_by_id.values(), key=lambda item: item["test_case_code"]),
        "recent_comments": [
            {
                "author_user_id": comment.author_user_id,
                "author_display_name": comment.author.display_name if comment.author is not None else None,
                "content": comment.content,
                "created_at": comment.created_at.isoformat(),
            }
            for comment in sorted(change_item.review_comments, key=lambda item: item.created_at)
        ],
        "project_members": [
            {
                "user_id": member.user_id,
                "display_name": member.user_display_name,
                "email": member.user_email,
                "role": member.role,
            }
            for member in project_members
        ],
        "rag_enabled": use_rag,
        "rag_context": _build_rag_context(session, change_item, precomputed_embedding=precomputed_embedding) if use_rag else [],
    }


def calibrate_generated_risk_level(change_item: ChangeItem, risk_level: str | None) -> str | None:
    if risk_level is None:
        return None

    normalized_risk = risk_level.strip().lower()
    if normalized_risk != "high":
        return normalized_risk

    text = _risk_calibration_text(change_item)
    if _matches_high_risk_profile(text):
        return normalized_risk
    if _matches_medium_risk_profile(text):
        return "medium"
    return normalized_risk


def _risk_calibration_text(change_item: ChangeItem) -> str:
    return " ".join(
        part.strip().lower()
        for part in (
            change_item.section_title or "",
            change_item.change_type or "",
            change_item.old_content or "",
            change_item.new_content or "",
        )
        if part and part.strip()
    )


def _matches_high_risk_profile(text: str) -> bool:
    liability_cap_expanded = (
        "all damages" in text
        and "one month" in text
        and ("confidentiality breach" in text or "equitable remed" in text)
    )
    deemed_acceptance_accelerated = (
        "deemed accepted" in text
        and ("3 business days" in text or "three business days" in text)
    )
    ip_ownership_lost = (
        "vendor retains ownership" in text
        and ("non-exclusive" in text or "internal-use license" in text)
    )
    return liability_cap_expanded or deemed_acceptance_accelerated or ip_ownership_lost


def _matches_medium_risk_profile(text: str) -> bool:
    independent_development_exclusion_removed = (
        "independently developed" in text
        and "exclusion" in text
        and "removed" in text
    )
    termination_right_narrowed = (
        "terminate for convenience" in text
        and ("30 days" in text or "thirty days" in text)
        and ("10 days" in text or "ten days" in text or "recipient may terminate" in text)
    )
    payment_accelerated = (
        ("fifty percent" in text or "50 percent" in text or "50%" in text)
        and "upfront" in text
        and ("15 days" in text or "fifteen days" in text)
    )
    preapproval_change_fee_added = (
        "time-and-materials" in text
        and "out-of-scope" in text
        and "before written change-order approval" in text
    )
    confidentiality_term_extended = (
        ("three years" in text or "3 years" in text)
        and ("five years" in text or "5 years" in text)
        and "confidentiality" in text
    )
    return (
        independent_development_exclusion_removed
        or termination_right_narrowed
        or payment_accelerated
        or preapproval_change_fee_added
        or confidentiality_term_extended
    )


def _build_rag_context(
    session: Session, change_item: ChangeItem,
    precomputed_embedding: tuple[str, list[float]] | None = None,
) -> list[dict[str, object]]:
    from app.services import rag_service

    rag_context: list[dict[str, object]] = []
    seen_block_ids: set[int] = set()

    for block in (change_item.source_block, change_item.target_block):
        if block is None or block.id in seen_block_ids:
            continue
        rag_context.append(rag_service.serialize_block_result(block))
        seen_block_ids.add(block.id)

    query = " ".join(
        part.strip()
        for part in (
            change_item.section_title or "",
            change_item.old_content or "",
            change_item.new_content or "",
        )
        if part and part.strip()
    )
    if not query:
        return rag_context

    query_embedding_payload = precomputed_embedding or rag_service.build_query_embedding_payload(query)
    for draft_id in (change_item.target_version_id, change_item.source_version_id):
        retrieved_blocks = rag_service.retrieve_similar_blocks(
            session,
            document_id=change_item.source_version.document_id,
            draft_id=draft_id,
            query=query,
            limit=2,
            exclude_block_ids=seen_block_ids,
            query_embedding_payload=query_embedding_payload,
        )
        for item in retrieved_blocks:
            block_id = int(item["block_id"])
            if block_id in seen_block_ids:
                continue
            rag_context.append(item)
            seen_block_ids.add(block_id)

    return rag_context


def _apply_generated_draft(draft: AIReviewDraft, normalized_draft: NormalizedAIReviewDraft) -> None:
    draft.suggested_assignee_user_id = normalized_draft.suggested_assignee_user_id
    draft.recommended_review_status = normalized_draft.recommended_review_status
    draft.explanation = normalized_draft.explanation
    draft.risk_level = normalized_draft.risk_level
    draft.draft_comment = normalized_draft.draft_comment
    draft.suggested_checks = normalized_draft.suggested_checks
    draft.confidence = normalized_draft.confidence
    draft.generation_status = normalized_draft.generation_status
    draft.provider_used = normalized_draft.provider_used
    draft.fallback_used = normalized_draft.fallback_used
    draft.error_message = None
    draft.generated_at = utcnow()


def _apply_failed_draft(
    draft: AIReviewDraft,
    normalized_draft: NormalizedAIReviewDraft,
    *,
    preserve_existing: bool,
) -> None:
    if not preserve_existing:
        draft.suggested_assignee_user_id = normalized_draft.suggested_assignee_user_id
        draft.recommended_review_status = normalized_draft.recommended_review_status
        draft.explanation = normalized_draft.explanation
        draft.risk_level = normalized_draft.risk_level
        draft.draft_comment = normalized_draft.draft_comment
        draft.suggested_checks = normalized_draft.suggested_checks
        draft.confidence = normalized_draft.confidence

    draft.generation_status = normalized_draft.generation_status
    draft.provider_used = normalized_draft.provider_used
    draft.fallback_used = normalized_draft.fallback_used
    draft.error_message = normalized_draft.error_message


def _serialize_generation_result(change_item_id: int, draft: AIReviewDraft) -> dict[str, object]:
    return {
        "change_item_id": change_item_id,
        "generation_status": draft.generation_status,
        "provider_used": draft.provider_used,
        "fallback_used": draft.fallback_used,
        "error_message": draft.error_message,
    }
