from pathlib import Path

from docx import Document as DocxDocument
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_ROOT, settings
from app.models import Document, DocumentVersion, Project, ProjectMember, User
from app.seed import seed_demo_users


WORKSPACE_PROJECT_NAME = "Redline Review Workspace"
LEGACY_PROJECT_NAMES = {WORKSPACE_PROJECT_NAME, "Redline SS2 Demo"}
WORKSPACE_PROJECT_DESCRIPTION = "Starter review workspace for live Redline project, document, parser, and compare flows."
DEMO_DOCUMENT_SPECS = [
    {
        "title": "Software Requirements Specification",
        "document_type": "SRS",
        "description": "Primary review document for the live Redline workflow.",
        "versions": [
            {
                "version_label": "v1.1",
                "file_name": "srs-v1.1.docx",
                "parse_status": "parsed",
                "notes": "Starter baseline source version for review and compare.",
            },
            {
                "version_label": "v2.0",
                "file_name": "srs-v2.0.docx",
                "parse_status": "parsed",
                "notes": "Starter target version for review and compare.",
            },
        ],
    },
    {
        "title": "API Specification",
        "document_type": "SPEC",
        "description": "Secondary document that keeps the project detail page populated with real data.",
        "versions": [
            {
                "version_label": "v1.0",
                "file_name": "api-spec-v1.0.docx",
                "parse_status": "pending",
                "notes": "Seeded secondary document version for the project inventory.",
            }
        ],
    },
]


def _ensure_demo_upload(document_id: int, file_name: str, version_label: str) -> str:
    target_dir = Path(settings.uploads_dir) / "demo" / f"document-{document_id}"
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_file = target_dir / f"{version_label}-{file_name}"
    if stored_file.suffix.lower() == ".docx" and not _is_valid_docx(stored_file):
        _write_demo_docx(stored_file, file_name=file_name, version_label=version_label)
    elif not stored_file.exists():
        stored_file.write_text(
            (
                f"Starter workspace upload for document {document_id} / {version_label}\n"
                f"Original file: {file_name}\n"
            ),
            encoding="utf-8",
        )
    return stored_file.relative_to(BACKEND_ROOT).as_posix()


def _is_valid_docx(file_path: Path) -> bool:
    if not file_path.exists():
        return False
    try:
        DocxDocument(file_path)
    except Exception:
        return False
    return True


def _write_demo_docx(file_path: Path, *, file_name: str, version_label: str) -> None:
    document = DocxDocument()
    document.add_heading("Software Requirements Specification", level=1)
    document.add_paragraph(f"Demo draft {version_label} generated for Redline parser and compare workflows.")

    document.add_heading("1. Purpose", level=2)
    document.add_paragraph(
        "The system supports contract review by parsing uploaded drafts, comparing clauses, "
        "and keeping review decisions traceable."
    )

    document.add_heading("2. Scope", level=2)
    if "v2" in version_label.lower() or "v2" in file_name.lower():
        document.add_paragraph(
            "The revised draft adds Contract Q&A, RAG-supported AI review, and parser diagnostics for reviewer trust."
        )
        document.add_paragraph("Reviewers must confirm AI suggestions before they become final review truth.")
    else:
        document.add_paragraph(
            "The baseline draft covers upload, parsing, deterministic comparison, and human review tracking."
        )

    document.add_heading("3. Acceptance", level=2)
    document.add_paragraph("Parser output must preserve clause anchors for Compare, Review, and Contract Q&A.")
    document.save(file_path)


def seed_demo_workspace(session: Session, current_user: User) -> dict[str, object]:
    demo_users = seed_demo_users(session)

    matching_projects = list(
        session.scalars(select(Project).where(Project.name.in_(LEGACY_PROJECT_NAMES)))
    )
    project = next(
        (candidate for candidate in matching_projects if candidate.name == WORKSPACE_PROJECT_NAME),
        matching_projects[0] if matching_projects else None,
    )
    if project is None:
        project = Project(name=WORKSPACE_PROJECT_NAME, description=WORKSPACE_PROJECT_DESCRIPTION)
        session.add(project)
        session.commit()
        session.refresh(project)
    else:
        project.name = WORKSPACE_PROJECT_NAME
        project.description = WORKSPACE_PROJECT_DESCRIPTION
        session.add(project)
        session.commit()
        session.refresh(project)

    member_specs: dict[int, str | None] = {
        current_user.id: "owner",
    }
    for index, demo_user in enumerate(demo_users):
        member_specs.setdefault(demo_user.id, "reviewer" if index else "editor")

    existing_member_user_ids = {
        member.user_id
        for member in session.scalars(
            select(ProjectMember).where(ProjectMember.project_id == project.id)
        )
    }

    for user_id, role in member_specs.items():
        if user_id not in existing_member_user_ids:
            session.add(ProjectMember(project_id=project.id, user_id=user_id, role=role))
    session.commit()

    existing_documents = {
        document.title: document
        for document in session.scalars(select(Document).where(Document.project_id == project.id))
    }

    documents_seeded = 0
    versions_seeded = 0

    for document_spec in DEMO_DOCUMENT_SPECS:
        document = existing_documents.get(document_spec["title"])
        if document is None:
            document = Document(
                project_id=project.id,
                title=document_spec["title"],
                document_type=document_spec["document_type"],
                description=document_spec["description"],
            )
            session.add(document)
            session.commit()
            session.refresh(document)
            existing_documents[document.title] = document
            documents_seeded += 1
        else:
            document.document_type = document_spec["document_type"]
            document.description = document_spec["description"]
            session.add(document)
            session.commit()
            session.refresh(document)

        existing_versions = {
            version.version_label: version
            for version in session.scalars(
                select(DocumentVersion).where(DocumentVersion.document_id == document.id)
            )
        }

        for version_spec in document_spec["versions"]:
            file_path = _ensure_demo_upload(
                document.id,
                version_spec["file_name"],
                version_spec["version_label"],
            )
            existing_version = existing_versions.get(version_spec["version_label"])
            if existing_version is not None:
                existing_version.file_name = version_spec["file_name"]
                existing_version.file_path = file_path
                existing_version.notes = version_spec["notes"]
                session.add(existing_version)
                continue

            session.add(
                DocumentVersion(
                    document_id=document.id,
                    version_label=version_spec["version_label"],
                    file_name=version_spec["file_name"],
                    file_path=file_path,
                    uploaded_by_user_id=current_user.id,
                    parse_status=version_spec["parse_status"],
                    notes=version_spec["notes"],
                )
            )
            versions_seeded += 1

    session.commit()
    session.refresh(project)

    return {
        "project": project,
        "documents_seeded": documents_seeded,
        "versions_seeded": versions_seeded,
    }
