"""Aggregate analytics data for a project."""

from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import (
    AIReviewDraft,
    ChangeItem,
    CompareRun,
    Document,
    DocumentVersion,
)


def get_project_analytics(session: Session, project_id: int) -> dict:
    """Return aggregated analytics for all compare runs in a project."""

    compare_run_ids = (
        select(CompareRun.id)
        .join(DocumentVersion, CompareRun.source_version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(Document.project_id == project_id)
    )

    # Change type distribution.
    change_type_rows = session.execute(
        select(
            ChangeItem.change_type,
            func.count(ChangeItem.id).label("count"),
        )
        .where(ChangeItem.compare_run_id.in_(compare_run_ids))
        .group_by(ChangeItem.change_type)
    ).all()

    change_type_counts = {"added": 0, "removed": 0, "modified": 0}
    for row in change_type_rows:
        change_type_counts[row.change_type] = row.count

    # Review status distribution.
    review_status_rows = session.execute(
        select(
            ChangeItem.review_status,
            func.count(ChangeItem.id).label("count"),
        )
        .where(ChangeItem.compare_run_id.in_(compare_run_ids))
        .group_by(ChangeItem.review_status)
    ).all()

    review_status_counts = {"open": 0, "in_review": 0, "resolved": 0}
    for row in review_status_rows:
        review_status_counts[row.review_status] = row.count

    # AI generation stats.
    ai_stats_rows = session.execute(
        select(
            AIReviewDraft.generation_status,
            func.count(AIReviewDraft.id).label("count"),
        )
        .join(ChangeItem, AIReviewDraft.change_item_id == ChangeItem.id)
        .where(ChangeItem.compare_run_id.in_(compare_run_ids))
        .group_by(AIReviewDraft.generation_status)
    ).all()

    ai_generation_counts = {"pending": 0, "generated": 0, "failed": 0}
    for row in ai_stats_rows:
        if row.generation_status in ai_generation_counts:
            ai_generation_counts[row.generation_status] = row.count

    # Risk level distribution.
    risk_rows = session.execute(
        select(
            AIReviewDraft.risk_level,
            func.count(AIReviewDraft.id).label("count"),
        )
        .join(ChangeItem, AIReviewDraft.change_item_id == ChangeItem.id)
        .where(
            ChangeItem.compare_run_id.in_(compare_run_ids),
            AIReviewDraft.risk_level.isnot(None),
        )
        .group_by(AIReviewDraft.risk_level)
    ).all()

    risk_counts = {"low": 0, "medium": 0, "high": 0}
    for row in risk_rows:
        if row.risk_level and row.risk_level.lower() in risk_counts:
            risk_counts[row.risk_level.lower()] = row.count

    # AI accuracy (recommended vs actual).
    accuracy_row = session.execute(
        select(
            func.count(AIReviewDraft.id).label("total"),
            func.sum(
                case(
                    (AIReviewDraft.recommended_review_status == ChangeItem.review_status, 1),
                    else_=0,
                )
            ).label("matched"),
        )
        .join(ChangeItem, AIReviewDraft.change_item_id == ChangeItem.id)
        .where(
            ChangeItem.compare_run_id.in_(compare_run_ids),
            AIReviewDraft.generation_status == "generated",
            AIReviewDraft.recommended_review_status.isnot(None),
            ChangeItem.review_status != "open",  # only count reviewed items
        )
    ).one_or_none()

    total_reviewed = accuracy_row.total if accuracy_row else 0
    matched = accuracy_row.matched if accuracy_row else 0
    ai_accuracy_pct = round((matched / total_reviewed) * 100, 1) if total_reviewed > 0 else None

    # Average confidence.
    avg_confidence_row = session.execute(
        select(func.avg(AIReviewDraft.confidence).label("avg_confidence"))
        .join(ChangeItem, AIReviewDraft.change_item_id == ChangeItem.id)
        .where(
            ChangeItem.compare_run_id.in_(compare_run_ids),
            AIReviewDraft.generation_status == "generated",
            AIReviewDraft.confidence.isnot(None),
        )
    ).one_or_none()

    avg_confidence = round(float(avg_confidence_row.avg_confidence), 2) if avg_confidence_row and avg_confidence_row.avg_confidence else None

    # Compare run stats.
    compare_run_rows = session.execute(
        select(
            CompareRun.compare_status,
            func.count(CompareRun.id).label("count"),
        )
        .join(DocumentVersion, CompareRun.source_version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(Document.project_id == project_id)
        .group_by(CompareRun.compare_status)
    ).all()

    compare_run_counts = {}
    for row in compare_run_rows:
        compare_run_counts[row.compare_status] = row.count

    # Per-document breakdown.
    doc_rows = session.execute(
        select(
            Document.id,
            Document.title,
            func.count(func.distinct(CompareRun.id)).label("compare_runs"),
            func.count(ChangeItem.id).label("total_changes"),
            func.sum(case((ChangeItem.review_status == "resolved", 1), else_=0)).label("resolved"),
        )
        .outerjoin(DocumentVersion, Document.id == DocumentVersion.document_id)
        .outerjoin(CompareRun, CompareRun.source_version_id == DocumentVersion.id)
        .outerjoin(ChangeItem, ChangeItem.compare_run_id == CompareRun.id)
        .where(Document.project_id == project_id)
        .group_by(Document.id, Document.title)
    ).all()

    per_document = [
        {
            "document_id": row.id,
            "title": row.title,
            "compare_runs": row.compare_runs or 0,
            "total_changes": row.total_changes or 0,
            "resolved": row.resolved or 0,
        }
        for row in doc_rows
    ]

    # Totals.
    total_changes = sum(change_type_counts.values())
    total_compare_runs = sum(compare_run_counts.values())

    return {
        "total_changes": total_changes,
        "total_compare_runs": total_compare_runs,
        "change_types": change_type_counts,
        "review_status": review_status_counts,
        "ai_generation": ai_generation_counts,
        "risk_levels": risk_counts,
        "ai_accuracy_pct": ai_accuracy_pct,
        "ai_avg_confidence": avg_confidence,
        "compare_runs": compare_run_counts,
        "per_document": per_document,
    }
