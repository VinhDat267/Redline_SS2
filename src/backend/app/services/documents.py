from pathlib import Path
from shutil import copyfileobj
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_ROOT, settings
from app.models import Document, DocumentVersion, User
from app.schemas.document import DocumentCreate, DocumentUpdate
from app.schemas.document_version import DocumentVersionUpdate
from app.services import document_parser
from app.services.projects import get_project_or_404


def list_documents(session: Session, project_id: int) -> list[Document]:
    return list(
        session.scalars(select(Document).where(Document.project_id == project_id).order_by(Document.id))
    )


def get_document_or_404(session: Session, document_id: int) -> Document:
    document = session.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


def create_document(session: Session, project_id: int, payload: DocumentCreate) -> Document:
    get_project_or_404(session, project_id)
    document = Document(
        project_id=project_id,
        title=payload.title,
        document_type=payload.document_type,
        description=payload.description,
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


def update_document(session: Session, document: Document, payload: DocumentUpdate) -> Document:
    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(document, field_name, value)
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


def delete_document(session: Session, document: Document) -> None:
    session.delete(document)
    session.commit()


def list_document_versions(session: Session, document_id: int) -> list[DocumentVersion]:
    return list(
        session.scalars(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.id)
        )
    )


def get_document_version_or_404(session: Session, version_id: int) -> DocumentVersion:
    version = session.get(DocumentVersion, version_id)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document version not found")
    return version


def create_document_version(
    session: Session,
    document_id: int,
    version_label: str,
    notes: str | None,
    actor_user_id: int | None,
    upload_file: UploadFile,
) -> DocumentVersion:
    get_document_or_404(session, document_id)

    if actor_user_id is not None and session.get(User, actor_user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing_version = session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_label == version_label,
        )
    )
    if existing_version is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Version already exists")

    original_name = Path(upload_file.filename or "document-version.docx").name
    file_suffix = (Path(original_name).suffix or ".docx").lower()
    if file_suffix not in {".docx", ".pdf"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Only .docx and .pdf files are supported",
        )

    target_dir = Path(settings.uploads_dir) / f"document-{document_id}"
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_file = target_dir / f"{uuid4().hex}{file_suffix}"
    with stored_file.open("wb") as output_stream:
        copyfileobj(upload_file.file, output_stream)

    version = DocumentVersion(
        document_id=document_id,
        version_label=version_label,
        file_name=original_name,
        file_path=stored_file.relative_to(BACKEND_ROOT).as_posix(),
        uploaded_by_user_id=actor_user_id,
        parse_status="pending",
        notes=notes,
    )
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def update_document_version(
    session: Session,
    version: DocumentVersion,
    payload: DocumentVersionUpdate,
) -> DocumentVersion:
    updates = payload.model_dump(exclude_unset=True)

    next_version_label = updates.get("version_label")
    if next_version_label and next_version_label != version.version_label:
        existing_version = session.scalar(
            select(DocumentVersion).where(
                DocumentVersion.document_id == version.document_id,
                DocumentVersion.version_label == next_version_label,
                DocumentVersion.id != version.id,
            )
        )
        if existing_version is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Version already exists")

    for field_name, value in updates.items():
        setattr(version, field_name, value)
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def delete_document_version(session: Session, version: DocumentVersion) -> None:
    file_path = BACKEND_ROOT / version.file_path
    session.delete(version)
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    if file_path.exists():
        file_path.unlink()


def parse_document_version(session: Session, version: DocumentVersion) -> DocumentVersion:
    return document_parser.parse_document_version(session, version)
