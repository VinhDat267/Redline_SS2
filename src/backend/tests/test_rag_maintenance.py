from sqlalchemy import select

from app.models import Document, DocumentBlock, DocumentParseRun, DocumentSurface, DocumentVersion, Project
from app.services import rag_maintenance, rag_service


def _configure_gemini_provider(monkeypatch, settings):
    monkeypatch.setattr(settings, "rag_embedding_provider", "openai_compatible")
    monkeypatch.setattr(settings, "rag_embedding_base_url", "http://localhost:20128/v1")
    monkeypatch.setattr(settings, "rag_embedding_api_key", "test-key")
    monkeypatch.setattr(settings, "rag_embedding_model", "gemini/gemini-embedding-2-preview")
    monkeypatch.setattr(settings, "rag_embedding_dimensions", 3072)
    monkeypatch.setattr(settings, "rag_embedding_fallback_to_local_hash", False)


def _seed_document_blocks(session):
    project = Project(name="RAG Maintenance", description="Provider cleanup")
    session.add(project)
    session.flush()

    document = Document(project_id=project.id, title="Maintenance Contract", document_type="CONTRACT")
    session.add(document)
    session.flush()

    version = DocumentVersion(
        document_id=document.id,
        version_label="v1.0",
        file_name="maintenance.docx",
        file_path="uploads/maintenance.docx",
        parse_status="parsed",
    )
    session.add(version)
    session.flush()

    parse_run = DocumentParseRun(
        document_version_id=version.id,
        parser_version="test",
        status="completed",
    )
    session.add(parse_run)
    session.flush()

    version.active_parse_run_id = parse_run.id

    surface = DocumentSurface(
        parse_run_id=parse_run.id,
        surface_type="body",
        surface_key="body",
        logical_order_index=0,
    )
    session.add(surface)
    session.flush()

    stale_vector = rag_service.embed_text("old hash")
    stale_json = rag_service.serialize_embedding(stale_vector)
    current_provider = rag_service.configured_embedding_provider_name()

    stale_block = DocumentBlock(
        document_version_id=version.id,
        parse_run_id=parse_run.id,
        surface_id=surface.id,
        block_key="body-0001",
        block_type="paragraph",
        section_title="Liability",
        heading_level=None,
        order_index=1,
        surface_order_index=1,
        raw_content="The liability cap is limited to $500,000.",
        normalized_content="The liability cap is limited to $500,000.",
        embedding_provider="local-hash",
        embedding_vector=stale_vector,
        embedding_vector_json=stale_json,
    )
    current_block = DocumentBlock(
        document_version_id=version.id,
        parse_run_id=parse_run.id,
        surface_id=surface.id,
        block_key="body-0002",
        block_type="paragraph",
        section_title="Term",
        heading_level=None,
        order_index=2,
        surface_order_index=2,
        raw_content="The agreement term is twelve months.",
        normalized_content="The agreement term is twelve months.",
        embedding_provider=current_provider,
        embedding_vector=[0.25] * 3072,
        embedding_vector_json=rag_service.serialize_embedding([0.25] * 3072),
    )
    session.add_all([stale_block, current_block])
    session.commit()
    return stale_block.id, current_block.id


def test_reembed_document_blocks_updates_stale_provider(session_factory, monkeypatch):
    from app.core.config import settings

    _configure_gemini_provider(monkeypatch, settings)
    with session_factory() as session:
        stale_id, current_id = _seed_document_blocks(session)

    provider = rag_service.configured_embedding_provider_name()

    def fake_payload(block):
        return provider, [0.5] * 3072, rag_service.serialize_embedding([0.5] * 3072)

    monkeypatch.setattr(rag_service, "build_block_embedding_payload", fake_payload)

    with session_factory() as session:
        summary = rag_maintenance.reembed_document_blocks(session)

    assert summary.scanned == 1
    assert summary.updated == 1
    assert summary.skipped == 0
    assert summary.failed == 0

    with session_factory() as session:
        stale_block = session.get(DocumentBlock, stale_id)
        current_block = session.get(DocumentBlock, current_id)

    assert stale_block.embedding_provider == provider
    assert stale_block.embedding_vector == [0.5] * 3072
    assert current_block.embedding_vector == [0.25] * 3072


def test_reembed_document_blocks_dry_run_does_not_mutate(session_factory, monkeypatch):
    from app.core.config import settings

    _configure_gemini_provider(monkeypatch, settings)
    with session_factory() as session:
        stale_id, _current_id = _seed_document_blocks(session)

    provider = rag_service.configured_embedding_provider_name()
    monkeypatch.setattr(
        rag_service,
        "build_block_embedding_payload",
        lambda _block: (provider, [0.75] * 3072, rag_service.serialize_embedding([0.75] * 3072)),
    )

    with session_factory() as session:
        summary = rag_maintenance.reembed_document_blocks(session, dry_run=True)

    assert summary.updated == 1
    assert summary.dry_run is True

    with session_factory() as session:
        stale_block = session.get(DocumentBlock, stale_id)

    assert stale_block.embedding_provider == "local-hash"


def test_collect_rag_health_reports_provider_counts(session_factory, monkeypatch):
    from app.core.config import settings

    _configure_gemini_provider(monkeypatch, settings)
    with session_factory() as session:
        _seed_document_blocks(session)

    provider = rag_service.configured_embedding_provider_name()
    monkeypatch.setattr(
        rag_service,
        "build_text_embedding_payload",
        lambda _text: (provider, [0.1] * 3072, rag_service.serialize_embedding([0.1] * 3072)),
    )

    with session_factory() as session:
        report = rag_maintenance.collect_rag_health(session)

    assert report.configured_provider == provider
    assert report.embedding_provider_ok is True
    assert report.embedding_dimensions == 3072
    assert report.embedding_dimensions_ok is True
    assert report.provider_counts["local-hash"] == 1
    assert report.provider_counts[provider] == 1
    assert report.stale_block_count == 1
    assert report.total_block_count == 2


def test_reembed_document_blocks_limits_batch_size(session_factory, monkeypatch):
    from app.core.config import settings

    _configure_gemini_provider(monkeypatch, settings)
    with session_factory() as session:
        _seed_document_blocks(session)

        stale_vector = rag_service.embed_text("another old hash")
        parse_run_id = session.scalar(select(DocumentParseRun.id))
        surface_id = session.scalar(select(DocumentSurface.id))
        version_id = session.scalar(select(DocumentVersion.id))
        session.add(
            DocumentBlock(
                document_version_id=version_id,
                parse_run_id=parse_run_id,
                surface_id=surface_id,
                block_key="body-0003",
                block_type="paragraph",
                section_title="Payment",
                heading_level=None,
                order_index=3,
                surface_order_index=3,
                raw_content="Payment is due within fifteen days.",
                normalized_content="Payment is due within fifteen days.",
                embedding_provider="local-hash",
                embedding_vector=stale_vector,
                embedding_vector_json=rag_service.serialize_embedding(stale_vector),
            )
        )
        session.commit()

    provider = rag_service.configured_embedding_provider_name()
    monkeypatch.setattr(
        rag_service,
        "build_block_embedding_payload",
        lambda _block: (provider, [0.9] * 3072, rag_service.serialize_embedding([0.9] * 3072)),
    )

    with session_factory() as session:
        summary = rag_maintenance.reembed_document_blocks(session, limit=1)

    assert summary.scanned == 1
    assert summary.updated == 1
