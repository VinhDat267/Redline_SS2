from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.vector_config import EMBEDDING_DIMENSIONS
from app.models import DocumentBlock
from app.services import rag_service


@dataclass(frozen=True)
class ReembedSummary:
    scanned: int
    updated: int
    skipped: int
    failed: int
    provider: str
    dry_run: bool
    errors: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RagHealthReport:
    configured_provider: str
    configured_model: str
    configured_dimensions: int
    database_dialect: str
    pgvector_dimensions: int | None
    pgvector_dimensions_ok: bool | None
    embedding_provider_ok: bool
    embedding_provider_error: str | None
    embedding_dimensions: int | None
    embedding_dimensions_ok: bool
    provider_counts: dict[str, int]
    total_block_count: int
    stale_block_count: int

    @property
    def healthy(self) -> bool:
        vector_ok = self.pgvector_dimensions_ok is not False
        return (
            self.embedding_provider_ok
            and self.embedding_dimensions_ok
            and vector_ok
            and self.stale_block_count == 0
        )

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["healthy"] = self.healthy
        return payload


def reembed_document_blocks(
    session: Session,
    *,
    force: bool = False,
    limit: int | None = None,
    dry_run: bool = False,
    allow_fallback: bool = False,
) -> ReembedSummary:
    provider = rag_service.configured_embedding_provider_name()
    query = select(DocumentBlock).order_by(DocumentBlock.id)
    if not force:
        query = query.where(
            (DocumentBlock.embedding_provider.is_(None))
            | (DocumentBlock.embedding_vector.is_(None))
            | (DocumentBlock.embedding_vector_json.is_(None))
            | (DocumentBlock.embedding_provider != provider)
        )
    if limit is not None:
        query = query.limit(limit)

    scanned = updated = skipped = failed = 0
    errors: list[str] = []

    for block in session.scalars(query):
        scanned += 1
        if not force and _block_has_current_embedding(block, provider):
            skipped += 1
            continue

        try:
            next_provider, vector, vector_json = rag_service.build_block_embedding_payload(block)
        except Exception as exc:  # pragma: no cover - exact provider failures vary by HTTP client
            failed += 1
            errors.append(f"block {block.id}: {exc}")
            continue

        if next_provider != provider and not allow_fallback:
            failed += 1
            errors.append(
                f"block {block.id}: embedding provider returned {next_provider}, expected {provider}"
            )
            continue

        updated += 1
        if dry_run:
            continue

        block.embedding_provider = next_provider
        block.embedding_vector = vector
        block.embedding_vector_json = vector_json
        block.embedding_generated_at = datetime.now(UTC).replace(tzinfo=None)
        session.add(block)

    if not dry_run:
        session.commit()

    return ReembedSummary(
        scanned=scanned,
        updated=updated,
        skipped=skipped,
        failed=failed,
        provider=provider,
        dry_run=dry_run,
        errors=errors,
    )


def collect_rag_health(session: Session) -> RagHealthReport:
    provider = rag_service.configured_embedding_provider_name()
    provider_counts = _provider_counts(session)
    total_block_count = sum(provider_counts.values())
    stale_block_count = sum(
        count
        for counted_provider, count in provider_counts.items()
        if counted_provider != provider
    )
    dialect_name = session.get_bind().dialect.name
    pgvector_dimensions = _pgvector_dimensions(session) if dialect_name == "postgresql" else None
    pgvector_dimensions_ok = (
        pgvector_dimensions == EMBEDDING_DIMENSIONS if pgvector_dimensions is not None else None
    )

    provider_ok = False
    provider_error: str | None = None
    embedding_dimensions: int | None = None
    try:
        returned_provider, vector, _vector_json = rag_service.build_text_embedding_payload(
            "Redline RAG health check."
        )
        provider_ok = returned_provider == provider
        embedding_dimensions = len(vector)
    except Exception as exc:  # pragma: no cover - exact provider failures vary by HTTP client
        provider_error = str(exc)

    return RagHealthReport(
        configured_provider=provider,
        configured_model=settings.rag_embedding_model,
        configured_dimensions=EMBEDDING_DIMENSIONS,
        database_dialect=dialect_name,
        pgvector_dimensions=pgvector_dimensions,
        pgvector_dimensions_ok=pgvector_dimensions_ok,
        embedding_provider_ok=provider_ok,
        embedding_provider_error=provider_error,
        embedding_dimensions=embedding_dimensions,
        embedding_dimensions_ok=embedding_dimensions == EMBEDDING_DIMENSIONS,
        provider_counts=provider_counts,
        total_block_count=total_block_count,
        stale_block_count=stale_block_count,
    )


def _block_has_current_embedding(block: DocumentBlock, provider: str) -> bool:
    return (
        block.embedding_provider == provider
        and block.embedding_vector is not None
        and block.embedding_vector_json is not None
    )


def _provider_counts(session: Session) -> dict[str, int]:
    rows = session.execute(
        select(
            DocumentBlock.embedding_provider,
            func.count(DocumentBlock.id),
        )
        .group_by(DocumentBlock.embedding_provider)
        .order_by(DocumentBlock.embedding_provider)
    ).all()
    return {str(provider or "<missing>"): int(count) for provider, count in rows}


def _pgvector_dimensions(session: Session) -> int | None:
    return session.execute(
        text(
            """
            SELECT atttypmod
            FROM pg_attribute
            WHERE attrelid = 'document_blocks'::regclass
              AND attname = 'embedding_vector'
            """
        )
    ).scalar()
