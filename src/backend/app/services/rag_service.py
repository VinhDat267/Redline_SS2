from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from collections.abc import Callable, Iterator
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.vector_config import EMBEDDING_DIMENSIONS
from app.models import Document, DocumentBlock, DocumentVersion

_TOKEN_RE = re.compile(r"[A-Za-z0-9$]+")
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"


class EmbeddingProviderError(RuntimeError):
    pass


class RetrievalCancelled(Exception):
    pass


_embedding_client_factory: Callable[..., httpx.Client] = httpx.Client


def build_embedding_text(
    *, block_type: str, section_title: str | None, content: str
) -> str:
    section = (section_title or "").strip()
    normalized_content = content.strip()
    if section:
        return f"{block_type} {section} {normalized_content}".strip()
    return f"{block_type} {normalized_content}".strip()


def embed_text(text: str) -> list[float]:
    tokens = [token.lower() for token in _TOKEN_RE.findall(text)]
    if not tokens:
        return [0.0] * EMBEDDING_DIMENSIONS

    counts = Counter(tokens)
    vector = [0.0] * EMBEDDING_DIMENSIONS
    for token, count in counts.items():
        digest = hashlib.sha1(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:2], byteorder="big") % EMBEDDING_DIMENSIONS
        sign = 1.0 if digest[2] % 2 == 0 else -1.0
        vector[index] += sign * float(count)

    magnitude = math.sqrt(sum(value * value for value in vector))
    if magnitude == 0:
        return [0.0] * EMBEDDING_DIMENSIONS
    return [round(value / magnitude, 6) for value in vector]


def serialize_embedding(vector: list[float]) -> str:
    return json.dumps(vector, separators=(",", ":"), ensure_ascii=True)


def deserialize_embedding(raw_embedding: str | None) -> list[float]:
    if not raw_embedding:
        return [0.0] * EMBEDDING_DIMENSIONS
    try:
        payload = json.loads(raw_embedding)
    except json.JSONDecodeError:
        return [0.0] * EMBEDDING_DIMENSIONS
    if not isinstance(payload, list):
        return [0.0] * EMBEDDING_DIMENSIONS
    values = [float(value) for value in payload[:EMBEDDING_DIMENSIONS]]
    if len(values) < EMBEDDING_DIMENSIONS:
        values.extend([0.0] * (EMBEDDING_DIMENSIONS - len(values)))
    return values


def build_block_embedding_payload(block: DocumentBlock) -> tuple[str, list[float], str]:
    return build_block_embedding_payload_from_text(
        block_type=block.block_type,
        section_title=block.section_title,
        content=block.normalized_content or block.raw_content,
    )


def build_block_embedding_fields(block: DocumentBlock) -> tuple[str, str]:
    provider, _vector, vector_json = build_block_embedding_payload(block)
    return provider, vector_json


def build_block_embedding_payload_from_text(
    *,
    block_type: str,
    section_title: str | None,
    content: str,
) -> tuple[str, list[float], str]:
    text = build_embedding_text(
        block_type=block_type,
        section_title=section_title,
        content=content,
    )
    return build_text_embedding_payload(text)


def build_text_embedding_payloads(
    texts: list[str],
) -> list[tuple[str, list[float], str]]:
    if not texts:
        return []

    provider = settings.rag_embedding_provider.strip().lower()
    if provider in {"openai", "openai_compatible", "openai-compatible"}:
        try:
            vectors: list[list[float]] = []
            for batch in _iter_embedding_batches(texts):
                vectors.extend(_embed_openai_compatible_batch(batch))
            provider_name = _openai_compatible_provider_name()
            return [
                (provider_name, vector, serialize_embedding(vector))
                for vector in vectors
            ]
        except EmbeddingProviderError:
            if not settings.rag_embedding_fallback_to_local_hash:
                raise

    return _build_local_hash_embedding_payloads(texts)


def build_text_embedding_payload(text: str) -> tuple[str, list[float], str]:
    return build_text_embedding_payloads([text])[0]


def build_query_embedding_payload(query: str) -> tuple[str, list[float]]:
    provider, vector, _vector_json = build_text_embedding_payload(query)
    return provider, vector


def build_query_embedding(query: str) -> list[float]:
    _provider, vector = build_query_embedding_payload(query)
    return vector


def _build_local_hash_embedding_payloads(
    texts: list[str],
) -> list[tuple[str, list[float], str]]:
    return [
        ("local-hash", vector, serialize_embedding(vector))
        for vector in (embed_text(text) for text in texts)
    ]


def _build_local_hash_embedding_payload(text: str) -> tuple[str, list[float], str]:
    return _build_local_hash_embedding_payloads([text])[0]


def _openai_compatible_provider_name() -> str:
    return f"openai-compatible:{settings.rag_embedding_model}"


def _configured_embedding_provider_name() -> str:
    provider = settings.rag_embedding_provider.strip().lower()
    if provider in {"openai", "openai_compatible", "openai-compatible"}:
        return _openai_compatible_provider_name()
    return "local-hash"


def configured_embedding_provider_name() -> str:
    return _configured_embedding_provider_name()


def _embedding_base_url() -> str:
    base_url = (
        settings.rag_embedding_base_url
        or settings.ai_openai_base_url
        or DEFAULT_OPENAI_BASE_URL
    )
    return base_url.rstrip("/")


def _embedding_api_key() -> str | None:
    if settings.rag_embedding_api_key:
        return settings.rag_embedding_api_key
    if _embedding_uses_gemini_openai_compat():
        return settings.ai_gemini_api_key
    return settings.ai_openai_api_key


def _embedding_uses_gemini_openai_compat() -> bool:
    hostname = urlparse(_embedding_base_url()).hostname or ""
    return hostname.lower().endswith("generativelanguage.googleapis.com")


def _iter_embedding_batches(texts: list[str]) -> Iterator[list[str]]:
    batch_size = max(int(getattr(settings, "rag_embedding_batch_size", 64)), 1)
    for start_index in range(0, len(texts), batch_size):
        yield texts[start_index : start_index + batch_size]


def _embed_openai_compatible(text: str) -> list[float]:
    return _embed_openai_compatible_batch([text])[0]


def _embed_openai_compatible_batch(texts: list[str]) -> list[list[float]]:
    api_key = _embedding_api_key()
    if not api_key:
        raise EmbeddingProviderError(
            "OpenAI-compatible embedding provider is not configured."
        )

    try:
        with _embedding_client_factory(
            timeout=settings.rag_embedding_timeout_seconds
        ) as client:
            response = client.post(
                f"{_embedding_base_url()}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.rag_embedding_model,
                    "input": texts,
                },
            )
    except httpx.HTTPError as exc:
        raise EmbeddingProviderError(
            "OpenAI-compatible embedding request failed."
        ) from exc

    if response.status_code >= 400:
        raise EmbeddingProviderError(
            f"OpenAI-compatible embedding request failed with status {response.status_code}."
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise EmbeddingProviderError(
            "OpenAI-compatible embedding provider returned non-JSON."
        ) from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list) or len(data) != len(texts):
        raise EmbeddingProviderError(
            "OpenAI-compatible embedding response is missing data."
        )

    vectors_by_index: list[list[float] | None] = [None] * len(texts)
    expected_dimensions = settings.rag_embedding_dimensions
    for response_index, item in enumerate(data):
        if not isinstance(item, dict):
            raise EmbeddingProviderError(
                "OpenAI-compatible embedding response item is invalid."
            )
        raw_vector = item.get("embedding")
        if not isinstance(raw_vector, list):
            raise EmbeddingProviderError(
                "OpenAI-compatible embedding response is missing vector."
            )

        vector = [float(value) for value in raw_vector]
        if len(vector) != expected_dimensions:
            raise EmbeddingProviderError(
                f"OpenAI-compatible embedding returned {len(vector)} dimensions; expected {expected_dimensions}."
            )
        vector_index = item.get("index", response_index)
        if (
            not isinstance(vector_index, int)
            or vector_index < 0
            or vector_index >= len(texts)
        ):
            raise EmbeddingProviderError(
                "OpenAI-compatible embedding response index is invalid."
            )
        vectors_by_index[vector_index] = vector

    if any(vector is None for vector in vectors_by_index):
        raise EmbeddingProviderError(
            "OpenAI-compatible embedding response is incomplete."
        )
    return [vector for vector in vectors_by_index if vector is not None]


def build_block_embedding_fields_from_text(
    *,
    block_type: str,
    section_title: str | None,
    content: str,
) -> tuple[str, str]:
    provider, _vector, vector_json = build_block_embedding_payload_from_text(
        block_type=block_type,
        section_title=section_title,
        content=content,
    )
    return provider, vector_json


def cosine_similarity(left: list[float], right: list[float]) -> float:
    return sum(
        left_value * right_value
        for left_value, right_value in zip(left, right, strict=False)
    )


def _session_uses_postgres(session: Session) -> bool:
    bind = session.get_bind()
    return bind is not None and bind.dialect.name == "postgresql"


def _ensure_block_embeddings(
    session: Session,
    blocks: list[DocumentBlock],
    *,
    embedding_provider: str,
) -> None:
    mutated = False
    for block in blocks:
        if (
            block.embedding_provider is not None
            and block.embedding_vector_json is not None
            and block.embedding_vector is not None
            and block.embedding_provider == embedding_provider
        ):
            continue

        provider, vector, vector_json = _build_block_embedding_payload_for_provider(
            block,
            embedding_provider=embedding_provider,
        )
        if provider != embedding_provider:
            continue
        block.embedding_provider = provider
        block.embedding_vector = vector
        block.embedding_vector_json = vector_json
        mutated = True

    if mutated:
        session.flush()


def _build_block_embedding_payload_for_provider(
    block: DocumentBlock,
    *,
    embedding_provider: str,
) -> tuple[str, list[float], str]:
    if embedding_provider == "local-hash":
        text = build_embedding_text(
            block_type=block.block_type,
            section_title=block.section_title,
            content=block.normalized_content or block.raw_content,
        )
        return _build_local_hash_embedding_payload(text)
    return build_block_embedding_payload(block)


def resolve_contract_draft_or_404(
    session: Session, contract_id: int, draft_id: int | None
) -> DocumentVersion:
    if draft_id is not None:
        draft = session.get(DocumentVersion, draft_id)
        if draft is None or draft.document_id != contract_id:
            raise ValueError("Contract draft not found")
        return draft

    draft = session.scalar(
        select(DocumentVersion)
        .where(
            DocumentVersion.document_id == contract_id,
            DocumentVersion.active_parse_run_id.is_not(None),
        )
        .order_by(DocumentVersion.id.desc())
    )
    if draft is None:
        raise ValueError("No parsed contract draft is available")
    return draft


def retrieve_similar_blocks(
    session: Session,
    *,
    document_id: int,
    query: str,
    limit: int = 5,
    draft_id: int | None = None,
    exclude_block_ids: set[int] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> list[dict[str, object]]:
    _raise_if_cancelled(should_cancel)
    draft = resolve_contract_draft_or_404(session, document_id, draft_id)
    exclude_block_ids = exclude_block_ids or set()
    _raise_if_cancelled(should_cancel)
    query_embedding_provider, query_embedding = build_query_embedding_payload(query)
    _raise_if_cancelled(should_cancel)

    block_query = (
        select(DocumentBlock)
        .where(DocumentBlock.parse_run_id == draft.active_parse_run_id)
        .options(joinedload(DocumentBlock.surface))
        .order_by(DocumentBlock.order_index)
    )
    blocks = list(session.scalars(block_query))
    _raise_if_cancelled(should_cancel)
    _ensure_block_embeddings(
        session,
        blocks,
        embedding_provider=query_embedding_provider,
    )
    _raise_if_cancelled(should_cancel)

    if _session_uses_postgres(session):
        return _retrieve_similar_blocks_postgres(
            session,
            parse_run_id=draft.active_parse_run_id,
            embedding_provider=query_embedding_provider,
            query_embedding=query_embedding,
            limit=limit,
            exclude_block_ids=exclude_block_ids,
        )

    return _retrieve_similar_blocks_python(
        blocks,
        embedding_provider=query_embedding_provider,
        query_embedding=query_embedding,
        limit=limit,
        exclude_block_ids=exclude_block_ids,
    )


def _retrieve_similar_blocks_python(
    blocks: list[DocumentBlock],
    *,
    embedding_provider: str,
    query_embedding: list[float],
    limit: int,
    exclude_block_ids: set[int],
) -> list[dict[str, object]]:
    scored_items: list[tuple[float, DocumentBlock]] = []
    for block in blocks:
        if block.id in exclude_block_ids:
            continue
        if block.embedding_provider != embedding_provider:
            continue
        score = cosine_similarity(
            query_embedding, deserialize_embedding(block.embedding_vector_json)
        )
        if score <= 0:
            continue
        scored_items.append((score, block))

    scored_items.sort(key=lambda item: item[0], reverse=True)
    return [
        serialize_block_result(block, score) for score, block in scored_items[:limit]
    ]


def _retrieve_similar_blocks_postgres(
    session: Session,
    *,
    parse_run_id: int,
    embedding_provider: str,
    query_embedding: list[float],
    limit: int,
    exclude_block_ids: set[int],
) -> list[dict[str, object]]:
    query = (
        select(
            DocumentBlock,
            DocumentBlock.embedding_vector.cosine_distance(query_embedding).label(
                "distance"
            ),
        )
        .where(
            DocumentBlock.parse_run_id == parse_run_id,
            DocumentBlock.embedding_provider == embedding_provider,
            DocumentBlock.embedding_vector.is_not(None),
        )
        .options(joinedload(DocumentBlock.surface))
        .order_by(
            DocumentBlock.embedding_vector.cosine_distance(query_embedding),
            DocumentBlock.order_index,
        )
        .limit(limit)
    )

    if exclude_block_ids:
        query = query.where(DocumentBlock.id.not_in(exclude_block_ids))

    rows = session.execute(query).all()
    return [
        serialize_block_result(block, max(0.0, 1.0 - float(distance)))
        for block, distance in rows
    ]


def serialize_block_result(
    block: DocumentBlock, score: float | None = None
) -> dict[str, object]:
    return {
        "block_id": block.id,
        "block_key": block.block_key,
        "section_title": block.section_title,
        "surface_type": block.surface.surface_type if block.surface is not None else "",
        "surface_key": block.surface.surface_key if block.surface is not None else "",
        "content": block.raw_content,
        "score": round(score, 6) if score is not None else None,
    }


def get_contract_or_404(session: Session, contract_id: int) -> Document:
    contract = session.get(Document, contract_id)
    if contract is None:
        raise ValueError("Contract not found")
    return contract


def _raise_if_cancelled(should_cancel: Callable[[], bool] | None) -> None:
    if should_cancel is not None and should_cancel():
        raise RetrievalCancelled()
