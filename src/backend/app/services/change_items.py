from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    ChangeItem,
    ChangeItemRequirementLink,
    Requirement,
    RequirementTestCaseMapping,
    ReviewComment,
    User,
    CompareRun,
    DocumentVersion,
    Document,
    ProjectMember,
)


def get_change_item_detail(session: Session, change_item_id: int) -> dict[str, object]:
    change_item = _get_change_item_or_404(session, change_item_id)
    return _serialize_change_item_detail(change_item)


def update_change_item(
    session: Session,
    change_item_id: int,
    updates: dict[str, object],
) -> dict[str, object]:
    change_item = _get_change_item_or_404(session, change_item_id)

    if "review_status" in updates:
        change_item.review_status = updates["review_status"]

    if "assignee_user_id" in updates:
        assignee_user_id = updates["assignee_user_id"]
        if assignee_user_id is None:
            change_item.assignee_user_id = None
        else:
            assignee = session.get(User, assignee_user_id)
            if assignee is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee user not found")

            project_id = _get_change_item_project_id(session, change_item.id)
            assignee_membership = session.scalar(
                select(ProjectMember.id).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == assignee_user_id,
                )
            )
            if assignee_membership is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee user not found")
            change_item.assignee_user_id = assignee_user_id

    if "summary" in updates:
        change_item.summary = updates["summary"]

    session.add(change_item)
    session.commit()
    return get_change_item_detail(session, change_item_id)


def create_review_comment(
    session: Session,
    change_item_id: int,
    author_user_id: int,
    content: str,
) -> dict[str, object]:
    change_item = _get_change_item_or_404(session, change_item_id)
    author = session.get(User, author_user_id)
    if author is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment author not found")

    comment = ReviewComment(
        change_item_id=change_item.id,
        author_user_id=author_user_id,
        content=content,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return _serialize_comment(comment)


def create_requirement_link(
    session: Session,
    change_item_id: int,
    requirement_id: int,
    notes: str | None = None,
) -> dict[str, object]:
    change_item = _get_change_item_or_404(session, change_item_id)
    requirement = session.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")

    # Validate that Requirement and ChangeItem both belong to the exact same Project
    # ChangeItem -> CompareRun -> DocumentVersion -> Document.project_id
    change_item_project_id = session.scalar(
        select(Document.project_id)
        .join(DocumentVersion, DocumentVersion.document_id == Document.id)
        .join(CompareRun, CompareRun.source_version_id == DocumentVersion.id)
        .join(ChangeItem, ChangeItem.compare_run_id == CompareRun.id)
        .where(ChangeItem.id == change_item_id)
    )
    # Requirement -> Document.project_id
    requirement_project_id = session.scalar(
        select(Document.project_id)
        .where(Document.id == requirement.document_id)
    )
    if not change_item_project_id or change_item_project_id != requirement_project_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Requirement belongs to a different project context")

    existing_link = session.scalar(
        select(ChangeItemRequirementLink)
        .where(
            ChangeItemRequirementLink.change_item_id == change_item_id,
            ChangeItemRequirementLink.requirement_id == requirement_id,
        )
    )
    if existing_link:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Requirement is already linked")

    link = ChangeItemRequirementLink(
        change_item_id=change_item_id,
        requirement_id=requirement_id,
        link_type="manual",
        notes=notes,
    )
    session.add(link)
    session.commit()
    # Return full detail to reflect the updated traceability
    return get_change_item_detail(session, change_item_id)


def delete_requirement_link(
    session: Session,
    change_item_id: int,
    requirement_id: int,
) -> dict[str, object]:
    _get_change_item_or_404(session, change_item_id)

    link = session.scalar(
        select(ChangeItemRequirementLink)
        .where(
            ChangeItemRequirementLink.change_item_id == change_item_id,
            ChangeItemRequirementLink.requirement_id == requirement_id,
        )
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    session.delete(link)
    session.commit()
    return get_change_item_detail(session, change_item_id)


def _get_change_item_or_404(session: Session, change_item_id: int) -> ChangeItem:
    change_item = session.scalar(
        select(ChangeItem)
        .where(ChangeItem.id == change_item_id)
        .options(
            joinedload(ChangeItem.assignee),
            joinedload(ChangeItem.ai_review_draft),
            joinedload(ChangeItem.review_comments).joinedload(ReviewComment.author),
            joinedload(ChangeItem.requirement_links)
            .joinedload(ChangeItemRequirementLink.requirement)
            .joinedload(Requirement.test_case_mappings)
            .joinedload(RequirementTestCaseMapping.test_case),
        )
    )
    if change_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change item not found")
    return change_item


def _serialize_change_item_detail(change_item: ChangeItem) -> dict[str, object]:
    impacted_tests_by_id: dict[int, dict[str, object]] = {}
    linked_requirements: list[dict[str, object]] = []

    for requirement_link in change_item.requirement_links:
        requirement = requirement_link.requirement
        mapped_test_cases: list[dict[str, object]] = []
        for mapping in requirement.test_case_mappings:
            test_case = mapping.test_case
            serialized_test_case = {
                "test_case_id": test_case.id,
                "test_case_code": test_case.test_case_code,
                "title": test_case.title,
                "priority": test_case.priority,
                "status": test_case.status,
            }
            mapped_test_cases.append(serialized_test_case)
            impacted_tests_by_id[test_case.id] = serialized_test_case

        linked_requirements.append(
            {
                "requirement_id": requirement.id,
                "requirement_code": requirement.requirement_code,
                "title": requirement.title,
                "link_type": requirement_link.link_type,
                "notes": requirement_link.notes,
                "mapped_test_cases": sorted(mapped_test_cases, key=lambda item: item["test_case_code"]),
            }
        )

    return {
        "id": change_item.id,
        "compare_run_id": change_item.compare_run_id,
        "change_type": change_item.change_type,
        "review_status": change_item.review_status,
        "assignee_user_id": change_item.assignee_user_id,
        "assignee_display_name": change_item.assignee.display_name if change_item.assignee is not None else None,
        "section_title": change_item.section_title,
        "surface_type": change_item.surface_type,
        "surface_key": change_item.surface_key,
        "container_type": change_item.container_type,
        "container_key": change_item.container_key,
        "table_key": change_item.table_key,
        "row_key": change_item.row_key,
        "old_content": change_item.old_content,
        "new_content": change_item.new_content,
        "summary": change_item.summary,
        "change_context_json": change_item.change_context_json,
        "structured_diff_json": change_item.structured_diff_json,
        "linked_requirements": linked_requirements,
        "impacted_tests": sorted(impacted_tests_by_id.values(), key=lambda item: item["test_case_code"]),
        "comments": [_serialize_comment(comment) for comment in change_item.review_comments],
        "ai_review_draft": _serialize_ai_review_draft(change_item.ai_review_draft),
    }


def _serialize_comment(comment: ReviewComment) -> dict[str, object]:
    return {
        "id": comment.id,
        "author_user_id": comment.author_user_id,
        "author_display_name": comment.author.display_name if comment.author is not None else None,
        "content": comment.content,
        "created_at": comment.created_at,
    }


def _get_change_item_project_id(session: Session, change_item_id: int) -> int:
    project_id = session.scalar(
        select(Document.project_id)
        .join(DocumentVersion, DocumentVersion.document_id == Document.id)
        .join(CompareRun, CompareRun.source_version_id == DocumentVersion.id)
        .join(ChangeItem, ChangeItem.compare_run_id == CompareRun.id)
        .where(ChangeItem.id == change_item_id)
    )
    if project_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change item not found")
    return project_id


def _serialize_ai_review_draft(ai_review_draft) -> dict[str, object] | None:
    if ai_review_draft is None:
        return None
    return {
        "id": ai_review_draft.id,
        "suggested_assignee_user_id": ai_review_draft.suggested_assignee_user_id,
        "recommended_review_status": ai_review_draft.recommended_review_status,
        "explanation": ai_review_draft.explanation,
        "risk_level": ai_review_draft.risk_level,
        "draft_comment": ai_review_draft.draft_comment,
        "suggested_checks": ai_review_draft.suggested_checks,
        "confidence": ai_review_draft.confidence,
        "generation_status": ai_review_draft.generation_status,
        "provider_used": ai_review_draft.provider_used,
        "fallback_used": ai_review_draft.fallback_used,
        "error_message": ai_review_draft.error_message,
        "generated_at": ai_review_draft.generated_at,
    }
