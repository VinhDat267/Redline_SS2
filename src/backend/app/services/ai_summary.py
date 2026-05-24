import json

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    CompareRun,
    ChangeItem,
    ChangeItemRequirementLink,
    Requirement,
    RequirementTestCaseMapping,
    User,
    ReviewComment,
)
from app.services import compare as compare_service
from app.services.compare import get_compare_run_detail
from app.services.llm_adapter import LLMAdapter


def generate_ai_summary_draft(session: Session, compare_run_id: int) -> dict:
    compare_run = session.get(CompareRun, compare_run_id)
    if compare_run is not None:
        compare_service.ensure_compare_run_is_current(session, compare_run)
    compare_run_detail = get_compare_run_detail(session, compare_run_id)

    change_items = session.execute(
        select(ChangeItem)
        .where(ChangeItem.compare_run_id == compare_run_id)
        .options(
            joinedload(ChangeItem.assignee),
            joinedload(ChangeItem.ai_review_draft),
            joinedload(ChangeItem.requirement_links)
            .joinedload(ChangeItemRequirementLink.requirement)
            .joinedload(Requirement.test_case_mappings)
            .joinedload(RequirementTestCaseMapping.test_case),
        )
    ).unique().scalars().all()

    review_counts = {"resolved": 0, "in_review": 0, "open": 0}
    relevant_items = []

    for item in change_items:
        status = item.review_status
        if status in review_counts:
            review_counts[status] += 1

        linked_requirements = []
        impacted_tests_by_id = {}
        for req_link in item.requirement_links:
            req = req_link.requirement
            linked_requirements.append(f"{req.requirement_code}: {req.title}")
            for mapping in req.test_case_mappings:
                tc = mapping.test_case
                impacted_tests_by_id[tc.id] = f"{tc.test_case_code}: {tc.title}"

        relevant_items.append({
            "change_type": item.change_type,
            "review_status": item.review_status,
            "section_title": item.section_title,
            "surface_type": item.surface_type,
            "summary": item.summary,
            "linked_requirements": linked_requirements,
            "impacted_tests": list(impacted_tests_by_id.values()),
            "ai_insights": item.ai_review_draft.explanation if item.ai_review_draft else None,
            "assignee": item.assignee.display_name if item.assignee else None,
        })

    payload = {
        "compare_run_summary": compare_run_detail["summary"],
        "compare_run_warnings": compare_run_detail["warnings"],
        "review_counts": review_counts,
        "change_items": relevant_items
    }

    llm = LLMAdapter()
    draft = llm.generate_ai_summary_draft(payload)

    return {
        "summary_text": draft.summary_text,
        "provider_used": draft.provider_used,
        "fallback_used": draft.fallback_used,
        "error_message": draft.error_message,
    }
